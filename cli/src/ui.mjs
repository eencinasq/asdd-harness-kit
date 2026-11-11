// Terminal output and prompts for the CLI.
import { createInterface } from 'node:readline/promises';

const color = process.stdout.isTTY && process.env.NO_COLOR !== '1';
const paint = (code) => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));

export const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  cyan: paint('36'),
  white: paint('1;37'),
};

let quiet = false;
/** --json: stdout carries one JSON object, so progress lines go nowhere (errors still reach stderr). */
export const setQuiet = (value) => {
  quiet = value;
};
export const isQuiet = () => quiet;

export const log = (text = '') => {
  if (!quiet) process.stdout.write(`${text}\n`);
};
export const info = (text) => log(`${c.blue('→')} ${text}`);
export const ok = (text) => log(`${c.green('✓')} ${text}`);
export const warn = (text) => log(`${c.yellow('⚠')} ${text}`);
export const err = (text) => process.stderr.write(`${c.red('✗')} ${text}\n`);
export const section = (text) => log(`\n${c.white(`==== ${text} ====`)}`);

export const isTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * Line prompts over stdin; one readline for the whole wizard. Lines are read from an iterator, so answers piped in
 * before a question is printed are not lost; at the end of input every question takes its default.
 */
export function prompter() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (text, fallback = '') => {
    process.stdout.write(`${c.cyan(text)}${fallback ? ` [${fallback}]` : ''}: `);
    const next = await lines.next();
    if (next.done) process.stdout.write('\n');
    const reply = next.done ? '' : String(next.value).trim();
    return reply || fallback;
  };
  const yes = async (text, fallback = 'y') => {
    const reply = await ask(`${text} ${fallback === 'y' ? '[Y/n]' : '[y/N]'}`);
    return /^y/i.test(reply || fallback);
  };
  const many = async (header, options) => {
    log('');
    log(c.bold(header));
    options.forEach((o, i) => log(`  ${c.dim(`[${i + 1}]`)} ${o}`));
    log(`  ${c.dim('[0] none')}`);
    const reply = await ask('Enter numbers separated by commas (e.g. 1,3)');
    if (!reply || reply === '0') return '';
    return reply
      .split(',')
      .map((n) => options[Number(n.trim()) - 1])
      .filter(Boolean)
      .join(',');
  };
  return { ask, yes, many, close: () => rl.close() };
}
