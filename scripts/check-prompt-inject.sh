#!/bin/bash
# check-prompt-inject.sh —— 一条命令看清这个插件现在的状态，出问题先跑它。
#
#   ./scripts/check-prompt-inject.sh
#
# 检查五件事：文件在不在、profile 配没配、软链通不通、机制坏没坏、宿主里跑没跑。
# 全是只读，不改任何东西。

set -o pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="$HOME/.dsh/profiles/desktop"
PLUGIN="$REPO/prompt-inject"
DATA="$REPO/prompt-inject"
NAME="@local/prompt-inject"

ok()   { printf '  ✓ %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
hint() { printf '      > %s\n' "$*"; }

fail=0

echo "== 1. 文件 =="
for f in index.js client.js package.json cordis.patch.yml icon.svg locale/zh.json locale/en.json test/smoke.mjs; do
  if [ -f "$PLUGIN/$f" ]; then ok "$f"; else bad "缺 $f"; fail=$((fail+1)); fi
done
if [ -f "$DATA/prompt.md" ]; then
  ok "prompt-inject/prompt.md（$(wc -c < "$DATA/prompt.md" | tr -d ' ') 字节）"
else
  bad "缺 prompt-inject/prompt.md（正文）"; fail=$((fail+1))
  hint "正文是插件的外部数据，从备份恢复即可"
fi

echo
echo "== 2. profile 配置（三处缺一不可）=="
if grep -q "\"$NAME\"" "$PROFILE/package.json" 2>/dev/null; then
  ok "package.json 里有依赖"
else
  bad "package.json 里没有 $NAME"; fail=$((fail+1))
  hint "cd \"$REPO\" && ./scripts/profile-restore.sh"
fi
if python3 -c "
import json,sys
d=json.load(open('$PROFILE/package.json'))
sys.exit(0 if '$NAME' in d.get('dsh',{}).get('profile',{}).get('bundles',[]) else 1)
" 2>/dev/null; then
  ok "bundles 里有它"
else
  bad "bundles 里没有（插件不会加载）"; fail=$((fail+1))
  hint "cd \"$REPO\" && ./scripts/profile-restore.sh"
fi
if grep -q "id: prompt-inject" "$PROFILE/cordis.patch.yml" 2>/dev/null; then
  ok "cordis.patch.yml 里有 insert"
else
  bad "cordis.patch.yml 里没有 insert"; fail=$((fail+1))
  hint "cd \"$REPO\" && ./scripts/profile-restore.sh"
fi
DIR_IN_CONFIG=$(grep -A3 "id: prompt-inject" "$PROFILE/cordis.patch.yml" 2>/dev/null | grep "dir:" | sed 's/.*dir: *"\(.*\)"/\1/')
if [ -n "$DIR_IN_CONFIG" ]; then
  if [ -d "$DIR_IN_CONFIG" ]; then
    ok "config.dir 指向的目录存在：$DIR_IN_CONFIG"
  else
    bad "config.dir 指向的目录不存在：$DIR_IN_CONFIG"
    hint "外接盘没挂载？或把 config.dir 改回 $DATA"
  fi
fi

echo
echo "== 3. 软链 =="
LINK="$PROFILE/node_modules/@local/prompt-inject"
if [ -L "$LINK" ]; then
  TARGET=$(readlink "$LINK")
  if [ -e "$LINK/" ]; then ok "软链指向 $TARGET"; else bad "软链断了（指向 $TARGET）"; fail=$((fail+1)); fi
elif [ -e "$LINK" ]; then
  warn "存在但不是软链：$LINK"
else
  bad "软链不存在"; fail=$((fail+1))
  hint "cd \"$REPO\" && ./scripts/profile-restore.sh"
fi

echo
echo "== 4. 机制自测（不读真实正文）=="
if out=$(cd "$PLUGIN" && node test/smoke.mjs 2>&1); then
  ok "$(echo "$out" | tail -1)"
else
  bad "自测失败"; fail=$((fail+1))
  echo "$out" | tail -6 | sed 's/^/      /'
fi

echo
echo "== 5. 宿主里跑没跑 =="
PORT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/DeepSeek/ && $9 ~ /127\.0\.0\.1:/ {split($9,a,":"); print a[2]; exit}')
if [ -z "$PORT" ]; then
  warn "没找到在跑的 DSH 进程（或端口未监听）"
  hint "打开 DSH 后再跑一次"
else
  ok "宿主端口 $PORT"
  BODY=$(curl -s -m 5 "http://127.0.0.1:$PORT/prompt-inject/status" 2>/dev/null)
  if [ -z "$BODY" ]; then
    bad "状态接口无响应（插件没加载）"
    hint "重启 DSH；仍不行就看 ~/.dsh 下的日志"
    fail=$((fail+1))
  else
    echo "$BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f\"      enabled={d.get('enabled')}  chars={d.get('chars')}  inject_chars={d.get('inject_chars')}\")
print(f\"      dir={d.get('dir')}\")
li = d.get('last_inject') or {}
if li.get('at'):
    print(f\"      last_inject={li['at']}  ({li.get('chars')} 字)\")
else:
    print('      last_inject=还没有（下一轮对话才会发生）')
" 2>/dev/null
    LAST=""
    LAST=$(echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('last_inject') or {}).get('at',''))" 2>/dev/null) || LAST=""
    if [ -n "$LAST" ]; then
      ok "注入在跑（上次附加 ${LAST}）"
    else
      warn "还没被调用过 —— 发一条消息后再看"
    fi
  fi
fi

echo
echo "== 6. 旧插件残留 =="
LEFT=$(find "$HOME/.dsh" -maxdepth 2 \( -name "*dsh-purge*" -o -name "*redteam*" \) -not -path "*/sessions/*" 2>/dev/null)
if [ -z "$LEFT" ]; then ok "没有旧插件残留"; else warn "还有残留:"; echo "$LEFT" | sed 's/^/      /'; fi

echo
if [ "$fail" -gt 0 ]; then
  echo "结果：$fail 处问题，按上面的 → 提示处理。"
  exit 1
fi
echo "结果：全部正常。"
echo
echo "日常用法：设置 → 插件 →「系统提示」里改文本，点「应用」即可，下一轮生效。"
