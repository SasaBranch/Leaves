// expo-file-system（SDK 57 の File / Directory / Paths）のテスト用の偽物（ADR 0019）。
// 振る舞いを自前で再現するとずれるので、一時フォルダ上で node の fs に処理を任せる。
// 細部は node_modules/expo-file-system/ios/*.swift の実装に合わせている
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

type CreateOptions = { intermediates?: boolean; overwrite?: boolean; idempotent?: boolean };
type FileCreateOptions = { intermediates?: boolean; overwrite?: boolean };
type RelocationOptions = { overwrite?: boolean };
type WriteOptions = { encoding?: 'utf8' | 'base64'; append?: boolean };
type Part = string | File | Directory;

const TEMP_PREFIX = 'leaves-fs-';

// jest の中では exit フックが効かず後片付けできないので、
// 名前に pid を入れておき、終了済みのプロセスが残した一時フォルダを次の起動時に消す
function removeStaleRoots(): void {
  for (const name of fs.readdirSync(os.tmpdir())) {
    const pid = Number(name.slice(TEMP_PREFIX.length).split('-')[0]);
    if (!name.startsWith(TEMP_PREFIX) || !Number.isInteger(pid) || isAlive(pid)) continue;
    fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM は他ユーザーのプロセスが生きている
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

removeStaleRoots();
// macOS の tmpdir はシンボリックリンク越しなので、実体のパスに揃えておく
const root = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), `${TEMP_PREFIX}${process.pid}-`)),
);
const documentPath = path.join(root, 'Documents');
const cachePath = path.join(root, 'Caches');
const DEFAULT_AVAILABLE_DISK_SPACE = 1024 * 1024 * 1024;

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const fakeDisk = { availableDiskSpace: DEFAULT_AVAILABLE_DISK_SPACE };

export function resetNodeFileSystem(): void {
  for (const dir of [documentPath, cachePath]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  fakeDisk.availableDiskSpace = DEFAULT_AVAILABLE_DISK_SPACE;
}

resetNodeFileSystem();

// 外部アプリによる変更をテストで起こすとき、node の fs で直接触るためのパス
export function nodePathOf(uri: string): string {
  return trimTrailingSlash(fileURLToPath(uri));
}

function trimTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

// expo の Paths.join と同じく、先頭は URI か File/Directory、以降はパスの部品として連結する
function joinParts(parts: Part[]): string {
  const [first = '', ...rest] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
  const base = first.startsWith('file:') ? fileURLToPath(first) : first;
  return trimTrailingSlash(path.join(base, ...rest));
}

function statOf(p: string): fs.Stats | undefined {
  return fs.lstatSync(p, { throwIfNoEntry: false });
}

function toMillis(ms: number): number {
  return Math.floor(ms);
}

function sizeOfTree(p: string): number {
  const stat = statOf(p);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(p).reduce((sum, name) => sum + sizeOfTree(path.join(p, name)), 0);
}

// File と Directory で共通の移動・コピー・名前変更（Swift の FileSystemPath に相当）
abstract class Entry {
  protected nodePath: string;
  protected abstract readonly isDirectory: boolean;

  constructor(parts: Part[]) {
    this.nodePath = joinParts(parts);
  }

  get uri(): string {
    const href = pathToFileURL(this.nodePath).href;
    return this.isDirectory && !href.endsWith('/') ? href + '/' : href;
  }

  get name(): string {
    return path.basename(this.nodePath);
  }

  get parentDirectory(): Directory {
    return new Directory(pathToFileURL(path.dirname(this.nodePath)).href);
  }

  get modificationTime(): number | null {
    const stat = statOf(this.nodePath);
    return stat ? toMillis(stat.mtimeMs) : null;
  }

  get creationTime(): number | null {
    const stat = statOf(this.nodePath);
    return stat ? toMillis(stat.birthtimeMs) : null;
  }

  delete(): void {
    // expo は存在しないものの削除を失敗させる
    if (!statOf(this.nodePath)) throw new Error(`Unable to delete: path does not exist: ${this.uri}`);
    fs.rmSync(this.nodePath, { recursive: true, force: true });
  }

  /** 実機では非同期（ネイティブの AsyncFunction）。await し忘れをテストで見つけられるよう、後で実行する */
  async move(destination: File | Directory, options?: RelocationOptions): Promise<void> {
    await nextTask();
    this.moveSync(destination, options);
  }

  moveSync(destination: File | Directory, options?: RelocationOptions): void {
    const target = this.prepareTarget(destination, options);
    fs.renameSync(this.nodePath, target);
    // 実機では File は移動先の uri に変わるが、Directory は元の uri のまま（シミュレータで確認）
    if (!this.isDirectory) this.nodePath = target;
  }

  async copy(destination: File | Directory, options?: RelocationOptions): Promise<void> {
    await nextTask();
    this.copySync(destination, options);
  }

  copySync(destination: File | Directory, options?: RelocationOptions): void {
    const target = this.prepareTarget(destination, options);
    fs.cpSync(this.nodePath, target, { recursive: true, errorOnExist: true, force: false });
  }

  rename(newName: string): void {
    const target = path.join(path.dirname(this.nodePath), newName);
    const current = statOf(this.nodePath);
    const existing = statOf(target);
    // APFS は大文字小文字を区別しないので、同じ実体への改名（Note → note）は許す
    const isSameEntry =
      current !== undefined &&
      existing !== undefined &&
      current.ino === existing.ino &&
      current.dev === existing.dev;
    if (existing && !isSameEntry) throw new Error(`Unable to rename: destination exists: ${target}`);
    fs.renameSync(this.nodePath, target);
    this.nodePath = target;
  }

  // Swift の getMoveOrCopyPath と同じ規則で行き先を決める
  private prepareTarget(destination: File | Directory, options?: RelocationOptions): string {
    const destinationPath = (destination as Entry).nodePath;
    let target: string;
    if (destination instanceof Directory) {
      if (!this.isDirectory) target = path.join(destinationPath, this.name);
      // unix の mv と同じく、既にあるフォルダへはその中へ、無ければその名前で置く
      else target = destination.exists ? path.join(destinationPath, this.name) : destinationPath;
    } else {
      if (this.isDirectory) throw new Error('Unable to move or copy a directory to a file');
      target = destinationPath;
    }
    // node の renameSync は既存のファイルを黙って上書きするので、ここで明示的に止める
    if (statOf(target)) {
      if (!options?.overwrite) throw new Error(`Destination already exists: ${target}`);
      fs.rmSync(target, { recursive: true, force: true });
    }
    return target;
  }
}

export class Directory extends Entry {
  protected readonly isDirectory = true;

  constructor(...parts: Part[]) {
    super(parts);
  }

  get exists(): boolean {
    return statOf(this.nodePath)?.isDirectory() ?? false;
  }

  get size(): number | null {
    return this.exists ? sizeOfTree(this.nodePath) : null;
  }

  create(options: CreateOptions = {}): void {
    if (statOf(this.nodePath)) {
      if (options.idempotent && this.exists) return;
      if (!options.overwrite) throw new Error(`Unable to create: already exists: ${this.uri}`);
      fs.rmSync(this.nodePath, { recursive: true, force: true });
    }
    // intermediates なしなら、親が無いと mkdirSync が失敗する（expo と同じ）
    fs.mkdirSync(this.nodePath, { recursive: options.intermediates ?? false });
  }

  createFile(name: string, _mimeType: string | null): File {
    const file = new File(this, name);
    file.create();
    return file;
  }

  createDirectory(name: string): Directory {
    const directory = new Directory(this, name);
    directory.create();
    return directory;
  }

  // iOS は名前を NFD で返すので合わせる（アプリ側で NFC に揃え忘れるとテストで気づける）。
  // macOS の APFS は正規化の違いを区別しないので、NFD のパスでもそのまま開ける
  list(): (File | Directory)[] {
    return fs.readdirSync(this.nodePath, { withFileTypes: true }).map((entry) => {
      const name = entry.name.normalize('NFD');
      return entry.isDirectory() ? new Directory(this, name) : new File(this, name);
    });
  }

  info(): {
    exists: boolean;
    uri: string;
    size?: number;
    modificationTime?: number;
    creationTime?: number;
    files?: string[];
  } {
    const stat = statOf(this.nodePath);
    if (!stat?.isDirectory()) return { exists: false, uri: this.uri };
    return {
      exists: true,
      uri: this.uri,
      size: sizeOfTree(this.nodePath),
      modificationTime: toMillis(stat.mtimeMs),
      creationTime: toMillis(stat.birthtimeMs),
      files: fs.readdirSync(this.nodePath).map((name) => name.normalize('NFD')),
    };
  }
}

export class File extends Entry {
  protected readonly isDirectory = false;

  constructor(...parts: Part[]) {
    super(parts);
  }

  get exists(): boolean {
    return statOf(this.nodePath)?.isFile() ?? false;
  }

  get size(): number {
    return this.exists ? (statOf(this.nodePath)?.size ?? 0) : 0;
  }

  get extension(): string {
    return path.extname(this.nodePath);
  }

  // expo の File.create は idempotent を持たない（既存なら overwrite 以外は失敗）
  create(options: FileCreateOptions = {}): void {
    if (statOf(this.nodePath) && !options.overwrite) {
      throw new Error(`Unable to create: already exists: ${this.uri}`);
    }
    if (options.intermediates) fs.mkdirSync(path.dirname(this.nodePath), { recursive: true });
    fs.rmSync(this.nodePath, { recursive: true, force: true });
    fs.writeFileSync(this.nodePath, '');
  }

  write(content: string | Uint8Array, options: WriteOptions = {}): void {
    const data =
      typeof content === 'string' && options.encoding === 'base64'
        ? Buffer.from(content, 'base64')
        : content;
    if (options.append) fs.appendFileSync(this.nodePath, data);
    else fs.writeFileSync(this.nodePath, data);
  }

  async text(): Promise<string> {
    return this.textSync();
  }

  textSync(): string {
    return fs.readFileSync(this.nodePath, 'utf8');
  }

  async bytes(): Promise<Uint8Array> {
    return this.bytesSync();
  }

  bytesSync(): Uint8Array {
    return new Uint8Array(fs.readFileSync(this.nodePath));
  }

  async base64(): Promise<string> {
    return this.base64Sync();
  }

  base64Sync(): string {
    return fs.readFileSync(this.nodePath).toString('base64');
  }

  info(): {
    exists: boolean;
    uri: string;
    size?: number;
    modificationTime?: number;
    creationTime?: number;
  } {
    const stat = statOf(this.nodePath);
    if (!stat?.isFile()) return { exists: false, uri: this.uri };
    return {
      exists: true,
      uri: this.uri,
      size: stat.size,
      modificationTime: toMillis(stat.mtimeMs),
      creationTime: toMillis(stat.birthtimeMs),
    };
  }
}

export const Paths = {
  // expo と同じく、参照のたびに新しいインスタンスを返す
  get document(): Directory {
    return new Directory(pathToFileURL(documentPath).href);
  },
  get cache(): Directory {
    return new Directory(pathToFileURL(cachePath).href);
  },
  get availableDiskSpace(): number {
    return fakeDisk.availableDiskSpace;
  },
};
