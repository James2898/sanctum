"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const EXPECTED_KEY_PLACEHOLDER = "YOUR_EXTENSION_PUBLIC_KEY_HERE";
const EXPECTED_CLIENT_ID_PLACEHOLDER =
  "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidExtensionVersion(version) {
  if (typeof version !== "string" || !/^\d+(?:\.\d+){0,3}$/.test(version)) {
    return false;
  }
  return version.split(".").every((segment) => {
    const num = Number(segment);
    return Number.isInteger(num) && num >= 0 && num <= 65535;
  });
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => deepEqual(item, b[idx]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (!deepEqual(keysA, keysB)) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

function stripCredentialFields(manifest) {
  const clone = JSON.parse(JSON.stringify(manifest));
  delete clone.key;
  if (isPlainObject(clone.oauth2)) {
    delete clone.oauth2.client_id;
  }
  return clone;
}

function assertLocalAssetExists(fileLabel, fieldPath, relativeAssetPath, errors) {
  if (!isNonEmptyString(relativeAssetPath)) {
    errors.push(`${fileLabel}: ${fieldPath} must be a non-empty asset path string`);
    return;
  }
  const resolved = path.resolve(ROOT_DIR, relativeAssetPath);
  const relativeCheck = path.relative(ROOT_DIR, resolved);
  if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
    errors.push(`${fileLabel}: ${fieldPath} ("${relativeAssetPath}") resolves outside repository root`);
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    errors.push(`${fileLabel}: ${fieldPath} references missing file "${relativeAssetPath}"`);
  }
}

function loadManifest(fileName, errors) {
  const fullPath = path.join(ROOT_DIR, fileName);
  let rawText;
  try {
    rawText = fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    errors.push(`${fileName}: unable to read file (${err.message})`);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    errors.push(`${fileName}: invalid JSON syntax (${err.message})`);
    return null;
  }

  if (!isPlainObject(parsed)) {
    errors.push(`${fileName}: root JSON value must be a non-null plain object`);
    return null;
  }

  return parsed;
}

function validateManifestSchemaAndAssets(fileLabel, manifest, errors) {
  if (manifest.manifest_version !== 3) {
    errors.push(`${fileLabel}: manifest_version must be 3`);
  }

  if (!isNonEmptyString(manifest.name)) {
    errors.push(`${fileLabel}: name must be a non-empty string`);
  }

  if (!isValidExtensionVersion(manifest.version)) {
    errors.push(
      `${fileLabel}: version must match Chrome MV3 format (1-4 dot-separated integers 0..65535)`,
    );
  }

  if (
    !Array.isArray(manifest.permissions) ||
    manifest.permissions.length === 0 ||
    !manifest.permissions.every(isNonEmptyString)
  ) {
    errors.push(`${fileLabel}: permissions must be a non-empty array of strings`);
  } else {
    for (const requiredPerm of ["identity", "storage"]) {
      if (!manifest.permissions.includes(requiredPerm)) {
        errors.push(`${fileLabel}: permissions must include "${requiredPerm}"`);
      }
    }
  }

  if (
    !Array.isArray(manifest.host_permissions) ||
    manifest.host_permissions.length === 0 ||
    !manifest.host_permissions.every(isNonEmptyString)
  ) {
    errors.push(`${fileLabel}: host_permissions must be a non-empty array of match strings`);
  }

  if (!isPlainObject(manifest.background) || !isNonEmptyString(manifest.background.service_worker)) {
    errors.push(`${fileLabel}: background.service_worker must be a non-empty string`);
  } else {
    assertLocalAssetExists(
      fileLabel,
      "background.service_worker",
      manifest.background.service_worker,
      errors,
    );
  }

  if (!isPlainObject(manifest.action)) {
    errors.push(`${fileLabel}: action must be an object`);
  } else {
    if (manifest.action.default_popup !== undefined) {
      assertLocalAssetExists(
        fileLabel,
        "action.default_popup",
        manifest.action.default_popup,
        errors,
      );
    }
    if (manifest.action.default_icon !== undefined) {
      if (typeof manifest.action.default_icon === "string") {
        assertLocalAssetExists(
          fileLabel,
          "action.default_icon",
          manifest.action.default_icon,
          errors,
        );
      } else if (isPlainObject(manifest.action.default_icon)) {
        for (const [size, iconPath] of Object.entries(manifest.action.default_icon)) {
          assertLocalAssetExists(
            fileLabel,
            `action.default_icon["${size}"]`,
            iconPath,
            errors,
          );
        }
      } else {
        errors.push(`${fileLabel}: action.default_icon must be a string or object`);
      }
    }
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    errors.push(`${fileLabel}: content_scripts must be a non-empty array`);
  } else {
    manifest.content_scripts.forEach((entry, idx) => {
      if (!isPlainObject(entry)) {
        errors.push(`${fileLabel}: content_scripts[${idx}] must be an object`);
        return;
      }
      if (
        !Array.isArray(entry.matches) ||
        entry.matches.length === 0 ||
        !entry.matches.every(isNonEmptyString)
      ) {
        errors.push(
          `${fileLabel}: content_scripts[${idx}].matches must be a non-empty array of strings`,
        );
      }
      if (
        !Array.isArray(entry.js) ||
        entry.js.length === 0 ||
        !entry.js.every(isNonEmptyString)
      ) {
        errors.push(
          `${fileLabel}: content_scripts[${idx}].js must be a non-empty array of strings`,
        );
      } else {
        entry.js.forEach((scriptPath, jsIdx) => {
          assertLocalAssetExists(
            fileLabel,
            `content_scripts[${idx}].js[${jsIdx}]`,
            scriptPath,
            errors,
          );
        });
      }
    });
  }

  if (!isPlainObject(manifest.icons) || Object.keys(manifest.icons).length === 0) {
    errors.push(`${fileLabel}: icons must be a non-empty object`);
  } else {
    for (const [size, iconPath] of Object.entries(manifest.icons)) {
      assertLocalAssetExists(fileLabel, `icons["${size}"]`, iconPath, errors);
    }
  }

  if (!isPlainObject(manifest.oauth2)) {
    errors.push(`${fileLabel}: oauth2 must be an object`);
  } else {
    if (!isNonEmptyString(manifest.oauth2.client_id)) {
      errors.push(`${fileLabel}: oauth2.client_id must be a non-empty string`);
    }
    if (
      !Array.isArray(manifest.oauth2.scopes) ||
      manifest.oauth2.scopes.length === 0 ||
      !manifest.oauth2.scopes.every(isNonEmptyString)
    ) {
      errors.push(`${fileLabel}: oauth2.scopes must be a non-empty array of strings`);
    }
  }
}

function main() {
  const errors = [];

  const examplePath = path.join(ROOT_DIR, "manifest.example.json");
  if (!fs.existsSync(examplePath)) {
    console.error("❌ manifest.example.json is required but was not found.");
    process.exit(1);
  }

  const exampleManifest = loadManifest("manifest.example.json", errors);
  if (exampleManifest) {
    validateManifestSchemaAndAssets("manifest.example.json", exampleManifest, errors);

    if (exampleManifest.key !== EXPECTED_KEY_PLACEHOLDER) {
      errors.push(
        `manifest.example.json: key must equal "${EXPECTED_KEY_PLACEHOLDER}"`,
      );
    }
    if (
      !isPlainObject(exampleManifest.oauth2) ||
      exampleManifest.oauth2.client_id !== EXPECTED_CLIENT_ID_PLACEHOLDER
    ) {
      errors.push(
        `manifest.example.json: oauth2.client_id must equal "${EXPECTED_CLIENT_ID_PLACEHOLDER}"`,
      );
    }
  }

  const realPath = path.join(ROOT_DIR, "manifest.json");
  if (fs.existsSync(realPath)) {
    const realManifest = loadManifest("manifest.json", errors);
    if (realManifest) {
      validateManifestSchemaAndAssets("manifest.json", realManifest, errors);

      if (exampleManifest) {
        const sanitizedExample = stripCredentialFields(exampleManifest);
        const sanitizedReal = stripCredentialFields(realManifest);
        if (!deepEqual(sanitizedExample, sanitizedReal)) {
          errors.push(
            "manifest.example.json and manifest.json diverge on non-credential fields (only key and oauth2.client_id may differ)",
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ Manifest V3 validation failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const validatedFiles = fs.existsSync(realPath)
    ? "manifest.example.json and manifest.json (with parity verified)"
    : "manifest.example.json";
  console.log(`✅ Manifest V3 validation passed for ${validatedFiles}.`);
}

main();
