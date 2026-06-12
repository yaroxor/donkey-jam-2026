import debug from 'debug';

// Namespaced loggers. Enable in browser DevTools console:
//   localStorage.debug = 'joe:*'             // everything
//   localStorage.debug = 'joe:dialogue'      // single subsystem
//   localStorage.debug = 'joe:*,-joe:loot'   // all except loot
// Then reload the page.

export const log = {
    dialogue: debug('joe:dialogue'),
    hand: debug('joe:hand'),
    loot: debug('joe:loot'),
    music: debug('joe:music'),
    sus: debug('joe:sus'),
};
