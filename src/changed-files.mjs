import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function collectChangedEntries({
  projectRoot,
  gitStatusMaxBuffer,
  normalizeRepoPath,
  isPathInsidePublic,
}) {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot });
  } catch {
    return null;
  }

  let stdout = '';
  try {
    const result = await execFileAsync(
      'git',
      // Handle spaces, unicode, and quotes in file names safely.
      [
        '-c',
        'core.quotepath=false',
        'status',
        '--porcelain=1',
        '-z',
        '-M',
        '--untracked-files=all',
        '--',
        'public',
      ],
      {
        cwd: projectRoot,
        maxBuffer: gitStatusMaxBuffer,
      }
    );
    stdout = result.stdout || '';
  } catch {
    return null;
  }

  const records = stdout.split('\0').filter(Boolean);

  const paths = new Set();
  const renames = [];
  const deletions = new Set();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4 || record[2] !== ' ') continue;

    const status = record.slice(0, 2);
    const primaryPath = normalizeRepoPath(record.slice(3));
    if (!primaryPath) continue;

    const x = status[0];
    const y = status[1];
    const isRenameOrCopy = x === 'R' || x === 'C' || y === 'R' || y === 'C';

    if (isRenameOrCopy) {
      const secondaryRaw = records[index + 1] || '';
      index += 1;

      const secondaryPath = normalizeRepoPath(secondaryRaw);
      if (!secondaryPath) continue;

      const newPath = primaryPath;
      const oldPath = secondaryPath;
      if (!isPathInsidePublic(newPath) && !isPathInsidePublic(oldPath)) continue;

      renames.push({ oldPath, newPath });
      paths.add(newPath);
      continue;
    }

    if (!isPathInsidePublic(primaryPath)) continue;

    if (status === '??') {
      paths.add(primaryPath);
      continue;
    }

    if (x === 'D' || y === 'D') {
      deletions.add(primaryPath);
      continue;
    }

    paths.add(primaryPath);
  }

  return { paths, renames, deletions };
}
