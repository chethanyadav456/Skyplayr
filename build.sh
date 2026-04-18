#!/bin/bash

set -e

# Skyplayr Extension Build Script
# Updates version in package.json + manifest.json
# Creates production ZIP for Chrome Web Store upload

EXTENSION_NAME="skyplayr"
BUILD_DIR="build"
ZIP_NAME="${EXTENSION_NAME}.zip"

# Files/Folders to exclude
EXCLUDES=(
  ".git/*"
  ".github/*"
  "node_modules/*"
  "$BUILD_DIR/*"
  "*.DS_Store"
  "*.md"
  ".env"
  ".env.*"
  ".gitignore"
  "PRIVACY_POLICY.md"
  "build.sh"
)

echo "====================================="
echo " Skyplayr Production Build Started"
echo "====================================="

# Ask for new version
read -p "Enter new version (example: 1.0.4): " NEW_VERSION

if [[ -z "$NEW_VERSION" ]]; then
  echo "Version cannot be empty."
  exit 1
fi

echo ""
echo "Updating version to: $NEW_VERSION"

# Update package.json
if [ -f "package.json" ]; then
  sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
  rm -f package.json.bak
  echo "Updated package.json"
else
  echo "package.json not found, skipping..."
fi

# Update manifest.json
if [ -f "manifest.json" ]; then
  sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" manifest.json
  rm -f manifest.json.bak
  echo "Updated manifest.json"
else
  echo "manifest.json not found."
  exit 1
fi

# Clean old build
echo ""
echo "Cleaning old builds..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo ""
echo "Creating ZIP package..."

ZIP_EXCLUDE_ARGS=()
for item in "${EXCLUDES[@]}"; do
  ZIP_EXCLUDE_ARGS+=("-x" "$item")
done

zip -r "$BUILD_DIR/$ZIP_NAME" . "${ZIP_EXCLUDE_ARGS[@]}"

echo ""
echo "====================================="
echo " Build Completed Successfully"
echo "====================================="
echo "Version: $NEW_VERSION"
echo "Output: $BUILD_DIR/$ZIP_NAME"
echo ""
echo "Upload this ZIP to Chrome Web Store Developer Dashboard"
echo "====================================="