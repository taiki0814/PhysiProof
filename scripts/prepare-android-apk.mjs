import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.android-local');
const tools = path.join(local, 'tools');
const artifact = path.join(tools, 'apksig-8.9.2.jar');
const artifactHash = 'c070ed1394629d74641aa0906f60b2ffa1ee77e6366a1f93437f59717b1aeb89';
const hash = value => createHash('sha256').update(value).digest('hex');
const executable = name => process.platform === 'win32' ? name + '.exe' : name;
const javaHomes = [process.env.JAVA_HOME, 'C:/Program Files/Java/jdk-17', 'C:/Program Files/Android/Android Studio/jbr'].filter(Boolean);
const javaHome = javaHomes.find(home => existsSync(path.join(home, 'bin', executable('javac'))));
if (!javaHome) throw new Error('JDK 17以上が必要です。JDKを導入してから再実行してください。');
const run = (tool, args, extra = {}) => execFileSync(path.join(javaHome, 'bin', executable(tool)), args, {
  cwd: root, windowsHide: true, encoding: 'utf8', ...extra,
});

await mkdir(tools, { recursive: true });
if (!existsSync(artifact)) {
  const response = await fetch('https://dl.google.com/dl/android/maven2/com/android/tools/build/apksig/8.9.2/apksig-8.9.2.jar');
  if (!response.ok) throw new Error('Google公式のAPK署名ツールを取得できませんでした。');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== artifactHash) throw new Error('APK署名ツールの検証に失敗しました。');
  await writeFile(artifact + '.part', bytes);
  await rename(artifact + '.part', artifact);
}
if (hash(await readFile(artifact)) !== artifactHash) throw new Error('APK署名ツールのハッシュが一致しません。');

const input = process.argv[2];
if (!input || !input.toLowerCase().endsWith('.apk')) throw new Error('使い方: npm run android:package -- <ビルド済みAPKのパス>');
const source = path.resolve(input);
if (!existsSync(source)) throw new Error('入力APKが見つかりません。');
const configFile = path.join(local, 'signing.json');
const keystore = path.join(local, 'foope-pilot.keystore');
if (existsSync(configFile) !== existsSync(keystore)) throw new Error('署名鍵の一部が見つかりません。バックアップを確認してください。鍵の再作成はしません。');
let config;
if (existsSync(configFile)) {
  config = JSON.parse(await readFile(configFile, 'utf8'));
} else {
  config = { alias: 'foope-pilot', password: randomBytes(32).toString('hex') };
  run('keytool', ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', config.alias,
    '-storepass:env', 'FOOPE_APK_STORE_PASSWORD', '-keypass:env', 'FOOPE_APK_STORE_PASSWORD',
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=foope Android Pilot', '-noprompt'],
    { env: { ...process.env, FOOPE_APK_STORE_PASSWORD: config.password }, stdio: 'pipe' });
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  console.log('ローカルの更新用署名鍵を作成しました。.android-local内の署名鍵・設定を安全な場所に保管してください。Gitには保存しません。');
}
if (!config || typeof config.password !== 'string' || config.alias !== 'foope-pilot') throw new Error('署名設定を確認してください。');

const gradle = await readFile(path.join(root, 'packages/mobile-native/android/runner/build.gradle'), 'utf8');
const version = /versionName '([0-9.]+)'/.exec(gradle)?.[1];
if (!version) throw new Error('アプリのバージョンを確認できません。');
const outputDir = path.join(root, 'output', 'android');
await mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, `foope-${version}.apk`);
if (source === output) throw new Error('入力と出力は別のファイルにしてください。');
const classes = path.join(tools, 'classes');
await mkdir(classes, { recursive: true });
run('javac', ['-cp', artifact, '-d', classes, 'scripts/android/SignApk.java']);
const verified = run('java', ['-cp', [classes, artifact].join(path.delimiter), 'SignApk', source, output, keystore, config.alias],
  { env: { ...process.env, FOOPE_APK_STORE_PASSWORD: config.password } });
const digest = hash(await readFile(output));
await writeFile(output + '.sha256', `${digest}  ${path.basename(output)}\n`);
console.log(verified.trim());
console.log(`APK: ${output}\nSHA-256: ${digest}`);
