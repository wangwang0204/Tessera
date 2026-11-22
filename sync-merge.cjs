const { isoNow, createNote } = require('./model.cjs');

/**
 * Perform a three-way merge between local book and incoming remote book.
 * - Handles added notes from both sides
 * - Handles concurrently updated notes (picks newer updatedAt, creates conflict copy for the other)
 * - Merges canvasPositions and topics safely
 */
function mergeNotebooks(serverBook, clientBook, lastSyncDigest, currentServerDigest) {
  // If digests match, they are already identical
  if (currentServerDigest === lastSyncDigest && clientBook.digest === currentServerDigest) {
    return { mergedBook: serverBook, conflictCount: 0, changed: false };
  }

  const merged = structuredClone(serverBook);
  let conflictCount = 0;
  let changed = false;

  // 1. Merge topics
  const serverTopicNames = new Set(merged.topics.map(t => t.name.trim().toLowerCase()));
  for (const clientTopic of (clientBook.topics || [])) {
    if (!serverTopicNames.has(clientTopic.name.trim().toLowerCase())) {
      merged.topics.push(clientTopic);
      serverTopicNames.add(clientTopic.name.trim().toLowerCase());
      changed = true;
    }
  }

  // 2. Index notes
  const serverNotesMap = new Map(merged.notes.map(n => [n.id, n]));
  const clientNotesMap = new Map((clientBook.notes || []).map(n => [n.id, n]));

  // 3. Process notes from client
  for (const [id, clientNote] of clientNotesMap.entries()) {
    const serverNote = serverNotesMap.get(id);

    if (!serverNote) {
      // Note exists on client but not on server
      const isDeletedOnServer = (merged.deleted || []).some(d => d.id === id);
      if (!isDeletedOnServer) {
        merged.notes.push(clientNote);
        changed = true;
      }
    } else {
      // Note exists on both sides
      const clientContent = clientNote.content || '';
      const serverContent = serverNote.content || '';

      if (clientContent !== serverContent) {
        // Content changed concurrently!
        const clientTime = new Date(clientNote.updatedAt || 0).getTime();
        const serverTime = new Date(serverNote.updatedAt || 0).getTime();

        if (clientTime > serverTime) {
          // Client is newer: save server version as conflict copy, accept client note
          const conflictCopy = createNote(merged, { content: serverNote.content });
          conflictCopy.source = '同步衝突副本 (雲端原版)';
          conflictCopy.topicID = serverNote.topicID;

          serverNote.content = clientNote.content;
          serverNote.contentRevision = (serverNote.contentRevision || 0) + 1;
          serverNote.updatedAt = clientNote.updatedAt || isoNow();
          conflictCount++;
          changed = true;
        } else {
          // Server is newer: save client version as conflict copy
          const conflictCopy = createNote(merged, { content: clientNote.content });
          conflictCopy.source = '同步衝突副本 (桌面修改)';
          conflictCopy.topicID = clientNote.topicID;
          conflictCount++;
          changed = true;
        }
      }
    }
  }

  // 4. Merge canvas positions
  merged.canvasPositions = {
    ...(merged.canvasPositions || {}),
    ...(clientBook.canvasPositions || {})
  };

  // 5. Merge lastUsedNoteColor if updated
  if (clientBook.lastUsedNoteColor && !merged.lastUsedNoteColor) {
    merged.lastUsedNoteColor = clientBook.lastUsedNoteColor;
    changed = true;
  }

  return { mergedBook: merged, conflictCount, changed };
}

module.exports = { mergeNotebooks };
