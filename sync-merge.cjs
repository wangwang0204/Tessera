const { isoNow, createNote } = require('./model.cjs');

/**
 * Perform a three-way merge between local book and incoming remote book.
 * - Handles added notes from both sides
 * - Handles concurrently updated notes (picks newer updatedAt, creates conflict copy for the other)
 * - Merges canvasPositions and topics safely
 */
function sameNoteContent(a, b) {
  return Boolean(a) && Boolean(b) && String(a.content || '') === String(b.content || '');
}

function mergeNotebooks(serverBook, clientBook, lastSyncDigest, currentServerDigest, baseBook) {
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
  const baseNotesMap = new Map((baseBook?.notes || []).map(n => [n.id, n]));

  // 3. Process notes from client
  for (const [id, clientNote] of clientNotesMap.entries()) {
    const serverNote = serverNotesMap.get(id);
    const baseNote = baseNotesMap.get(id);

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
        // A real three-way merge can accept a one-sided change without making a
        // conflict copy. The old implementation ignored its alleged base state,
        // so reconnecting a client repeatedly duplicated notes.
        if (baseNote && sameNoteContent(serverNote, baseNote)) {
          Object.assign(serverNote, structuredClone(clientNote));
          changed = true;
          continue;
        }
        if (baseNote && sameNoteContent(clientNote, baseNote)) continue;

        // Both sides changed since their common base (or no base is available).
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

  // A client-side deletion only wins when the server note has not changed since
  // the common base. This deliberately favours retaining data when a base is
  // unavailable or both sides changed.
  for (const [id, baseNote] of baseNotesMap.entries()) {
    if (clientNotesMap.has(id)) continue;
    const serverNote = serverNotesMap.get(id);
    if (serverNote && sameNoteContent(serverNote, baseNote)) {
      merged.notes = merged.notes.filter(note => note.id !== id);
      serverNotesMap.delete(id);
      changed = true;
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
