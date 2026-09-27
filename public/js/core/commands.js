// App commands (v3 Phase 4): one registry of named actions, so a header
// button, a Settings row and the command palette all run the same code. A
// module registers the commands it owns (malImport.js registers
// "import.open", and so on); anything in the page can run one with
// data-command="<id>" on a button, or runCommand(id).
//
// A command is { id, title, keywords?, section?, run(arg), available?() }.
// `title` is user-facing copy (already resolved through copy()), shown by the
// palette; `available` hides it from the palette when it does not apply.

const commands = new Map();

export function registerCommand(def) {
  if (!def?.id || typeof def.run !== 'function') throw new Error(`bad command ${def?.id}`);
  commands.set(def.id, def);
}

export function runCommand(id, arg) {
  const cmd = commands.get(id);
  if (!cmd) {
    console.error(`[commands] unknown command: ${id}`);
    return false;
  }
  cmd.run(arg);
  return true;
}

export function hasCommand(id) {
  return commands.has(id);
}

// Every command the palette may offer right now.
export function listCommands() {
  return [...commands.values()].filter((c) => c.title && (!c.available || c.available()));
}

// Delegated: a click on any [data-command] element runs that command.
let bound = false;
export function bindCommandButtons() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-command]');
    if (!el || el.disabled) return;
    e.preventDefault();
    runCommand(el.dataset.command, el.dataset.commandArg);
  });
}
