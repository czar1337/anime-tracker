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

// A provider returns commands that exist only while something is true (one
// per theme, say); they are listed like registered ones but not stored.
const providers = [];
export function registerCommandProvider(fn) {
  providers.push(fn);
}

// Every command the palette may offer right now.
export function listCommands() {
  const all = [...commands.values(), ...providers.flatMap((fn) => fn() || [])];
  return all.filter((c) => c.title && (!c.available || c.available()));
}

// Runs a command object from listCommands() (a provided one has no id in the
// registry).
export function runCommandObject(cmd, arg) {
  if (cmd.id && commands.get(cmd.id) === cmd) return runCommand(cmd.id, arg);
  cmd.run(arg);
  return true;
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
