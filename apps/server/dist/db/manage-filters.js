/**
 * 动态管理筛除规则（写入 event_filters 表，服务约 10s 内自动生效，无需改代码）。
 *
 * 用法：
 *   pnpm db:filters -- list
 *   pnpm db:filters -- add --type api --match host --value i.clarity.ms --note "Clarity"
 *   pnpm db:filters -- add --type resource --match url_prefix --value https://p26.douyinpic.com
 *   pnpm db:filters -- add --type resource --match url_exact --value=https://qlydata.com/\s
 *   pnpm db:filters -- disable --id 1
 *   pnpm db:filters -- enable --id 1
 *   pnpm db:filters -- remove --id 1
 */
import { initDB, closeDB } from './index.js';
import { addFilter, listAllFilters, removeFilter, setFilterEnabled, } from '../filters/eventFilters.js';
function printHelp() {
    console.log(`筛除规则管理

命令:
  list
  add --type <api|resource|...> --match <host|url_prefix|url_exact> --value <值> [--note <说明>]
  disable --id <id>
  enable --id <id>
  remove --id <id>

match 说明:
  host        匹配 URL hostname（含子域），常用于 api
  url_prefix  匹配 URL 前缀，常用于 resource CDN
  url_exact   完全匹配整段 URL，常用于精确筛除某条资源路径

含空格的值（推荐）:
  1) 用引号包起来
     --value "https://example.com/a b.png"
     --note "测试 说明"
  2) 用 --value=... 形式，空格写成 \\s 或 %20（适合尾部空格）
     --value=https://qlydata.com/\\s
     --value=https://example.com/a%20b.png

示例:
  pnpm db:filters -- list
  pnpm db:filters -- add --type api --match host --value example.com --note "测试域名"
  pnpm db:filters -- add --type resource --match url_prefix --value https://cdn.example.com/
  pnpm db:filters -- add --type resource --match url_exact --value=https://qlydata.com/\\s
  pnpm db:filters -- disable --id 3
  pnpm db:filters -- remove --id 3

清理历史命中数据:
  pnpm db:clean-filtered -- --dry-run
  pnpm db:clean-filtered
`);
}
/** 还原 CLI 转义：\\s / %20 → 空格 */
function unescapeCliValue(raw) {
    return raw.replace(/\\s/g, ' ').replace(/%20/g, ' ');
}
function getFlag(args, name, options) {
    const eqPrefix = `${name}=`;
    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        if (token.startsWith(eqPrefix)) {
            return unescapeCliValue(token.slice(eqPrefix.length));
        }
        if (token !== name)
            continue;
        if (options?.rest) {
            const parts = [];
            for (let j = i + 1; j < args.length; j++) {
                if (args[j].startsWith('--'))
                    break;
                parts.push(args[j]);
            }
            if (parts.length === 0)
                return undefined;
            return unescapeCliValue(parts.join(' '));
        }
        const next = args[i + 1];
        if (next == null || next.startsWith('--'))
            return undefined;
        return unescapeCliValue(next);
    }
    return undefined;
}
function requireFlag(args, name, options) {
    const value = getFlag(args, name, options);
    if (value == null || value === '') {
        throw new Error(`缺少参数 ${name}`);
    }
    return value;
}
async function printRows() {
    const rows = await listAllFilters();
    if (rows.length === 0) {
        console.log('（空）暂无筛除规则');
        return;
    }
    console.table(rows.map((r) => ({
        id: r.id,
        event_type: r.event_type,
        match_type: r.match_type,
        match_value: JSON.stringify(r.match_value),
        enabled: r.enabled ? 'yes' : 'no',
        note: r.note || '',
    })));
}
async function main() {
    await initDB();
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const cmd = args[0];
    try {
        if (!cmd || cmd === '-h' || cmd === '--help') {
            printHelp();
            return;
        }
        if (cmd === 'list') {
            await printRows();
            return;
        }
        if (cmd === 'add') {
            const eventType = requireFlag(args, '--type');
            const match = requireFlag(args, '--match');
            const value = requireFlag(args, '--value', { rest: true });
            const note = getFlag(args, '--note', { rest: true });
            const result = await addFilter({
                eventType,
                matchType: match,
                matchValue: value,
                note,
            });
            if (!result.ok) {
                console.error(result.error);
                process.exitCode = 1;
                return;
            }
            console.log(`已添加筛除项 id=${result.id}`);
            console.log(`match_value=${JSON.stringify(value)}`);
            await printRows();
            return;
        }
        if (cmd === 'disable' || cmd === 'enable') {
            const id = Number(requireFlag(args, '--id'));
            if (!Number.isFinite(id)) {
                throw new Error('--id 必须是数字');
            }
            const result = await setFilterEnabled(id, cmd === 'enable');
            if (!result.ok) {
                console.error(result.error);
                process.exitCode = 1;
                return;
            }
            console.log(`已${cmd === 'enable' ? '启用' : '禁用'} id=${id}`);
            await printRows();
            return;
        }
        if (cmd === 'remove') {
            const id = Number(requireFlag(args, '--id'));
            if (!Number.isFinite(id)) {
                throw new Error('--id 必须是数字');
            }
            const result = await removeFilter(id);
            if (!result.ok) {
                console.error(result.error);
                process.exitCode = 1;
                return;
            }
            console.log(`已删除 id=${id}`);
            await printRows();
            return;
        }
        console.error(`未知命令: ${cmd}`);
        printHelp();
        process.exitCode = 1;
    }
    catch (err) {
        console.error(err?.message || err);
        printHelp();
        process.exitCode = 1;
    }
    finally {
        await closeDB();
    }
}
main();
//# sourceMappingURL=manage-filters.js.map