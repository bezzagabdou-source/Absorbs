#!/bin/bash
cd "$(dirname "$0")"
W=${W:-720}; H=${H:-1280}; T=$(date +%s)
for ((s=0; s<3600; s+=600)); do
  e=$((s+600)); echo "== chunk $s-$e"
  LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp node render.mjs --w $W --h $H --from $s --to $e --out frames/all || echo "chunk $s failed"
  echo "   frames: $(ls frames/all/*.jpg | wc -l)  t=$(( $(date +%s)-T ))s"
done
echo ALL_DONE $(( $(date +%s)-T ))s
