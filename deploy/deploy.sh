#!/bin/bash
set -e

VPS="root@168.119.231.157"
APP_DIR="/opt/fussball2"

echo "==> Pushing to GitHub..."
git push origin main

echo "==> Deploying on server..."
ssh $VPS "cd $APP_DIR && git pull origin main"

echo ""
echo "==> Done! https://fsbl.maxapps.live"
