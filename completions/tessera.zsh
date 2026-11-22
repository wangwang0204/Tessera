#compdef tessera

_tessera_note_ids() {
  local -a notes
  notes=("${(@f)$(tessera --json list --limit 500 2>/dev/null | node -e '
    let text="";
    process.stdin.on("data", chunk => text += chunk).on("end", () => {
      try {
        for (const note of JSON.parse(text)) {
          const title = String(note.title || "").replace(/[\r\n\t:]/g, " ");
          console.log(`${note.id}:${title}`);
        }
      } catch {}
    });
  ')}")
  _describe -t notes '便利貼' notes
}

_tessera() {
  local -a commands global_options
  commands=(
    'list:列出最近更新的便利貼'
    'search:搜尋便利貼內容'
    'show:顯示一張便利貼'
    'todo:列出未完成待辦'
    'add:新增便利貼'
    'completion:輸出 shell 補全腳本'
  )
  global_options=(
    '--data[指定 notebook.json]:資料檔:_files'
    '--json[以 JSON 輸出]'
    '--help[顯示說明]'
  )

  if (( CURRENT == 2 )); then
    _describe -t commands 'tessera 指令' commands
    return
  fi

  case $words[2] in
    list)
      _arguments -s $global_options '--limit[最多顯示幾筆]:數量:'
      ;;
    search)
      _arguments -s $global_options '1:搜尋關鍵字:'
      ;;
    show)
      _arguments -s $global_options '1:便利貼 ID:_tessera_note_ids'
      ;;
    add)
      _arguments -s $global_options '--topic[主題名稱]:主題:' '--content[筆記內容]:內容:'
      ;;
    completion)
      _arguments -s '1:shell:(zsh)'
      ;;
    *)
      _arguments -s $global_options
      ;;
  esac
}

compdef _tessera tessera
