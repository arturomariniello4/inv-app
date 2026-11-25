# INV web app

The iPhone web app: install it from Safari (Share, Add to Home Screen), open it
from the Home Screen, and allow notifications. It shows the alerts, the 22:30
briefing, the Saturday report and the Ideas tab (companies ranked from their
filings, `ideas.js`) that the hourly run sends by encrypted web push, and keeps
them only on the phone.

Today opens on the headline snapshot (`snapshot.js`): the day's mood from the
markets, 3 to 5 numbered lines, what needs attention, what arrived since the last
look and the Ideas headline. A tap opens a story card; "Read the full briefing"
shows the newspaper layout. Briefings from before the snapshot show the newspaper
layout directly.

Only new information shows up front: the Alerts tab lists what arrived since the last
evening briefing, and the same alert received twice is shown once. Every earlier day is
in the Calendar tab (`calendar.js`): tap a day for its snapshot, alerts, Ideas headline
and reports.

Screens slide like a native iPhone app (`swipe.js`): opening a story, a day, a company or a
report slides it in from the right, and Back or a swipe to the right (from the left edge, or
anywhere that is not a sideways-scrolling strip) returns to the screen you came from, at the
same scroll position. Tabs switch instantly.

Everything moves like a finished iPhone app (`motion.js`, with GSAP and Lenis in `vendor/`):
cards rise in one after another, the headline comes into focus, figures count up and bars grow
when a screen opens; a card lights up and presses in under the finger; a marker slides along the
tab bar, and tapping the tab you are on glides back to the top. The effects are React Bits ideas
(AnimatedList, BlurText, CountUp, SpotlightCard) rewritten in plain JavaScript, since the app has
no React. A screen you go back to, or one re-drawn because new data arrived, appears as it was.
Settings, Motion, Glide scrolling lets Lenis take over finger scrolling too (off by default:
iOS's own scrolling is already smooth). iOS's Reduce Motion turns all of it off.

The Portfolio tab (`portfolio.js`) shows the real Trading 212 positions (read
only) and the risk check run on them: the stress loss against the 30% limit, the
satellite room, the mix of the growth pot and the look-through dashboard. The data
rides inside the evening briefing, so it reaches only this phone, encrypted; tap the
account value to hide amounts.

These files are published from the public repository `inv-app` on GitHub Pages.
They hold no data and no secrets: `config.js` carries only the sender's public
key. Information only: the app never trades.
