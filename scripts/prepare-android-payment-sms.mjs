import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const androidRoot = resolve(root, 'android');
if (!existsSync(androidRoot)) {
  throw new Error('Le projet Android Capacitor est absent. Exécutez d’abord: npx cap add android');
}

const source = resolve(root, 'native/android-sms');
const javaSource = resolve(source, 'com/mht/marketcash');
const javaTarget = resolve(androidRoot, 'app/src/main/java/com/mht/marketcash');
const manifestTarget = resolve(androidRoot, 'app/src/main/AndroidManifest.xml');

mkdirSync(javaTarget, { recursive: true });
cpSync(javaSource, javaTarget, { recursive: true, force: true });
cpSync(resolve(source, 'AndroidManifest.xml'), manifestTarget, { force: true });

console.log('Market-Cash Android Payment SMS bridge applied.');
