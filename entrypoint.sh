#!/bin/sh
pip3 install -U --pre "yt-dlp[default]" --break-system-packages
exec node index.js