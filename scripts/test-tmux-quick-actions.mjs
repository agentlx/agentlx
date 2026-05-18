import assert from "node:assert/strict";

const { getTmuxQuickActionById, searchTmuxQuickActions, tmuxQuickActions } = await import(
  new URL("../src/lib/tmux-quick-actions.ts", import.meta.url).href
);

assert.ok(tmuxQuickActions.length >= 50, "expected a broad tmux quick action catalog");

const ids = new Set();
const names = new Set();

for (const action of tmuxQuickActions) {
  assert.ok(action.id, "action id must exist");
  assert.ok(action.name, `action ${action.id} must have a name`);
  assert.ok(action.shortcut, `action ${action.id} must have a shortcut`);
  assert.ok(action.description, `action ${action.id} must have a description`);
  assert.ok(
    action.sequence.startsWith("\u0002"),
    `action ${action.id} must start with tmux prefix`,
  );
  assert.ok(!ids.has(action.id), `duplicate id found: ${action.id}`);
  assert.ok(!names.has(action.name), `duplicate name found: ${action.name}`);
  ids.add(action.id);
  names.add(action.name);
}

assert.equal(getTmuxQuickActionById("send-prefix")?.sequence, "\u0002\u0002");
assert.equal(getTmuxQuickActionById("split-window-horizontal")?.sequence, '\u0002"');
assert.equal(getTmuxQuickActionById("split-window-vertical")?.sequence, "\u0002%");
assert.equal(getTmuxQuickActionById("next-layout")?.sequence, "\u0002 ");
assert.equal(getTmuxQuickActionById("copy-mode-page-up")?.sequence, "\u0002\u001b[5~");
assert.equal(getTmuxQuickActionById("resize-pane-up-small")?.sequence, "\u0002\u001b[1;5A");
assert.equal(getTmuxQuickActionById("layout-tiled")?.sequence, "\u0002\u001b7");

const splitResults = searchTmuxQuickActions("split-window").map((item) => item.id);
assert.deepEqual(splitResults.sort(), ["split-window-horizontal", "split-window-vertical"]);

const layoutResults = searchTmuxQuickActions("layout");
assert.ok(layoutResults.length >= 8, "expected layout search to find all layout actions");

const paneResults = searchTmuxQuickActions("pane");
assert.ok(paneResults.length >= 15, "expected pane search to find pane-oriented actions");

console.log(
  JSON.stringify(
    {
      ok: true,
      actions: tmuxQuickActions.length,
      verified: [
        "unique ids",
        "unique names",
        "tmux prefix sequences",
        "known shortcut sequences",
        "search by function name",
      ],
    },
    null,
    2,
  ),
);
