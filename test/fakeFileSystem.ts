// expo-file-system のテスト用の偽物。ファイルの有無だけをメモリ上の集合で表す
export const fakeFiles = new Set<string>();
export const fakeDisk = { availableDiskSpace: 1024 * 1024 * 1024 };

function joinUri(parts: unknown[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
    .join('/');
}

export class Directory {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = joinUri(parts);
  }
  get exists() {
    return [...fakeFiles].some((file) => file.startsWith(this.uri + '/'));
  }
  create() {}
  delete() {
    for (const file of [...fakeFiles]) {
      if (file.startsWith(this.uri + '/')) fakeFiles.delete(file);
    }
  }
  list() {
    return [...fakeFiles]
      .filter((file) => file.startsWith(this.uri + '/'))
      .map((file) => ({ name: file.slice(this.uri.length + 1) }));
  }
}

export class File {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = joinUri(parts);
  }
  get name() {
    return this.uri.split('/').at(-1) ?? '';
  }
  get exists() {
    return fakeFiles.has(this.uri);
  }
  delete() {
    fakeFiles.delete(this.uri);
  }
  write() {
    fakeFiles.add(this.uri);
  }
  move(destination: File) {
    fakeFiles.delete(this.uri);
    fakeFiles.add(destination.uri);
    this.uri = destination.uri;
  }
}

export const Paths = {
  document: new Directory('doc'),
  cache: new Directory('cache'),
  get availableDiskSpace() {
    return fakeDisk.availableDiskSpace;
  },
};
