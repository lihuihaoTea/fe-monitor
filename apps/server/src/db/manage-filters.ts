/**
 * 动态管理筛除规则（写入 event_filters 表，服务约 10s 内自动生效，无需改代码）。
 *
 * 用法：
 *   pnpm db:filters -- list
 *   pnpm db:filters -- add --type api --match host --value i.clarity.ms --note "Clarity"
 *   pnpm db:filters -- add --type resource --match url_prefix --value https://p26.douyinpic.com
 *   pnpm db:filters -- disable --id 1
 *   pnpm db:filters -- enable --id 1
 *   pnpm db:filters -- remove --id 1
 */
import { initDB } from './index.js';
import {
  addFilter,
  listAllFilters,
  removeFilter,
  setFilterEnabled,
} from '../filters/eventFilters.js';

function printHelp() {
  console.log(`筛除规则管理

命令:
  list
  add --type <api|resource|...> --match <host|url_prefix> --value <值> [--note <说明>]
  disable --id <id>
  enable --id <id>
  remove --id <id>

示例:
  pnpm db:filters -- list
  pnpm db:filters -- add --type api --match host --value example.com --note "测试域名"
  pnpm db:filters -- add --type resource --match url_prefix --value https://cdn.example.com/
  pnpm db:filters -- disable --id 3
  pnpm db:filters -- remove --id 3
`);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function requireFlag(args: string[], name: string): string {
  const value = getFlag(args, name);
  if (!value) {
    throw new Error(`缺少参数 ${name}`);
  }
  return value;
}

function printRows() {
  const rows = listAllFilters();
  if (rows.length === 0) {
    console.log('（空）暂无筛除规则');
    return;
  }
  console.table(
    rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      match_type: r.match_type,
      match_value: r.match_value,
      enabled: r.enabled ? 'yes' : 'no',
      note: r.note || '',
    }))
  );
}

function main() {
  initDB();

  const args = process.argv.slice(2).filter((a) => a !== '--');
  const cmd = args[0];

  if (!cmd || cmd === '-h' || cmd === '--help') {
    printHelp();
    return;
  }

  try {
    if (cmd === 'list') {
      printRows();
      return;
    }

    if (cmd === 'add') {
      const eventType = requireFlag(args, '--type');
      const match = requireFlag(args, '--match') as 'host' | 'url_prefix';
      const value = requireFlag(args, '--value');
      const note = getFlag(args, '--note');
      const result = addFilter({
        eventType,
        matchType: match,
        matchValue: value,
        note,
      });
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`已添加筛除项 id=${result.id}`);
      printRows();
      return;
    }

    if (cmd === 'disable' || cmd === 'enable') {
      const id = Number(requireFlag(args, '--id'));
      if (!Number.isFinite(id)) {
        throw new Error('--id 必须是数字');
      }
      const result = setFilterEnabled(id, cmd === 'enable');
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`已${cmd === 'enable' ? '启用' : '禁用'} id=${id}`);
      printRows();
      return;
    }

    if (cmd === 'remove') {
      const id = Number(requireFlag(args, '--id'));
      if (!Number.isFinite(id)) {
        throw new Error('--id 必须是数字');
      }
      const result = removeFilter(id);
      if (!result.ok) {
        console.error(result.error);
        process.exit(1);
      }
      console.log(`已删除 id=${id}`);
      printRows();
      return;
    }

    console.error(`未知命令: ${cmd}`);
    printHelp();
    process.exit(1);
  } catch (err: any) {
    console.error(err?.message || err);
    printHelp();
    process.exit(1);
  }
}

main();
