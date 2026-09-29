// Copies the game's web files into www/, the folder Capacitor packages into the app.
// The game itself stays at the repo root so GitHub Pages keeps serving it unchanged.
import { cpSync, rmSync, mkdirSync } from "node:fs";

const OUT = "www";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const path of ["index.html", "css", "js"]) cpSync(path, OUT + "/" + path, { recursive: true });
console.log("Web dosyaları " + OUT + "/ klasörüne kopyalandı.");
