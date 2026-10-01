#!/bin/sh
# Entrada do contêiner. Discos de hospedagem (Render, Railway) chegam com dono root; aqui a pasta de dados passa
# para o usuário "node" e o servidor roda com ele, sem privilégios de administrador da máquina.
set -e
DIR="${DATA_DIR:-/dados}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DIR"
  if [ "$(stat -c %U "$DIR")" != "node" ]; then chown -R node:node "$DIR"; fi
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi
exec "$@"
