// =============================================================================
// download-model.mjs - Sherpa runtime downloader for this project
// =============================================================================
// Downloads only the frontend runtime assets actually used by the app.
// Avoids pulling the full Sherpa archive, which introduces unused files.
// =============================================================================

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, "..", "public", "sherpa-onnx");

const ASSETS = [
  {
    name: "WASM API Script",
    url: "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-asr.js",
    saveAs: "sherpa-onnx.js",
  },
  {
    name: "WASM Glue Code",
    url: "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-asr.js",
    saveAs: "sherpa-onnx-wasm-main-asr.js",
  },
  {
    name: "WASM Binary",
    url: "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-asr.wasm",
    saveAs: "sherpa-onnx-wasm-main-asr.wasm",
  },
  {
    name: "WASM Data File",
    url: "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main-asr.data",
    saveAs: "sherpa-onnx-wasm-main-asr.data",
  },
];

const REQUIRED_LOCAL_FILES = ["tokens.txt"];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function fileExistsWithContent(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = (currentUrl) => {
      https
        .get(currentUrl, (response) => {
          if ([301, 302, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location;
            if (location) {
              request(new URL(location, currentUrl).href);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${currentUrl}`));
            return;
          }

          const contentLength = parseInt(response.headers["content-length"] || "0", 10);
          let downloaded = 0;

          response.on("data", (chunk) => {
            downloaded += chunk.length;
            if (contentLength > 0) {
              const pct = ((downloaded / contentLength) * 100).toFixed(1);
              process.stdout.write(`\rDownloading ${path.basename(dest)}: ${pct}%`);
            }
          });

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            process.stdout.write("\n");
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
    };

    request(url);
  });
}

async function main() {
  console.log("============================================================");
  console.log("Sherpa runtime downloader");
  console.log("============================================================");

  ensureDir(TARGET_DIR);

  const failures = [];

  for (const asset of ASSETS) {
    const dest = path.join(TARGET_DIR, asset.saveAs);
    console.log(`\n${asset.name}`);

    if (fileExistsWithContent(dest)) {
      console.log(`Using existing file: ${asset.saveAs}`);
      continue;
    }

    try {
      await downloadFile(asset.url, dest);
      if (!fileExistsWithContent(dest)) {
        throw new Error(`Downloaded file is missing or empty: ${asset.saveAs}`);
      }
      console.log(`Saved: ${asset.saveAs}`);
    } catch (err) {
      const message = `Failed: ${err.message}`;
      console.error(message);
      failures.push(`${asset.saveAs}: ${err.message}`);
    }
  }

  for (const fileName of REQUIRED_LOCAL_FILES) {
    const filePath = path.join(TARGET_DIR, fileName);
    if (!fileExistsWithContent(filePath)) {
      failures.push(`${fileName}: required local runtime asset is missing or empty`);
    }
  }

  if (failures.length > 0) {
    console.error("\nModel asset validation failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\n============================================================");
  console.log("Done. Runtime assets are ready in public/sherpa-onnx/");
  console.log("============================================================");
}

main().catch(console.error);
