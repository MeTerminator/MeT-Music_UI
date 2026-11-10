#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 || ( "$1" != mpegh && "$1" != av3a && "$1" != dtsx ) ]]; then
  echo "Usage: bash $0 {mpegh|av3a|dtsx} /path/to/decoder-source" >&2
  exit 2
fi

codec=$1
asset_name=$codec
source_dir=$(cd "$2" && pwd)
script_dir=$(cd "$(dirname "$0")" && pwd)
asset_dir="$script_dir/../../public/spatial"
build_dir=$(mktemp -d)
trap 'rm -rf "$build_dir"' EXIT
if [[ "$codec" == dtsx ]]; then
  asset_name=dtsx-v2
  python3 "$script_dir/prepare-dtsx.py" "$source_dir" "$build_dir"
  compiler=em++
  inputs=(-std=c++20 -I "$source_dir/src" -I "$build_dir" "$script_dir/dtsx.cpp")
  for file in "$source_dir"/src/dtsx/ace_*.cpp; do
    if [[ -f "$build_dir/${file##*/}" ]]; then
      inputs+=("$build_dir/${file##*/}")
    else
      inputs+=("$file")
    fi
  done
  inputs+=("$build_dir/uhd_frame.cpp" "$source_dir/src/dtsx/speaker_mask.cpp")
else
  options=(-DCMAKE_BUILD_TYPE=Release)
  if [[ "$codec" == mpegh ]]; then
    options+=(-Dmpeghdec_BUILD_BINARIES=OFF -Dmpeghdec_BUILD_UIMANAGER=OFF -DBUILD_SHARED_LIBS=OFF)
    compiler=em++
    bridge=mpegh.cpp
    target=mpeghdec
    library=lib/libmpeghdec.a
  else
    compiler=emcc
    bridge=av3a.c
    target=molan_av3a
    library=libmolan_av3a.a
  fi
  emcmake cmake -S "$source_dir" -B "$build_dir" "${options[@]}"
  cmake --build "$build_dir" --target "$target" --parallel 8
  inputs=("$script_dir/$bridge" "$build_dir/$library" -I "$source_dir/include")
fi

"$compiler" -O3 "${inputs[@]}" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker -sFILESYSTEM=0 \
  -sALLOW_MEMORY_GROWTH=1 -sDISABLE_EXCEPTION_CATCHING=0 -sSTACK_SIZE=1048576 \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_spatial_init,_spatial_feed,_spatial_flush,_spatial_read,_spatial_rate,_spatial_position,_spatial_pcm,_spatial_close \
  -o "$build_dir/$asset_name.mjs"

mkdir -p "$asset_dir"
cp "$build_dir/$asset_name.mjs" "$asset_dir/$asset_name.js"
cp "$build_dir/$asset_name.wasm" "$asset_dir/"
if [[ "$codec" == mpegh ]]; then
  cp "$source_dir/LICENSE.txt" "$asset_dir/mpegh-LICENSE.txt"
  if [[ -d "$source_dir/.git" ]]; then
    git -C "$source_dir" archive --format=tar.gz --prefix=mpeghdec/ \
      -o "$asset_dir/mpegh-source.tar.gz" HEAD
  fi
elif [[ "$codec" == dtsx ]]; then
  cp "$source_dir/LICENSE" "$asset_dir/dtsx-LICENSE.txt"
fi
