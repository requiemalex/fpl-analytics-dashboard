import termsText from "../../../LICENSE.txt?raw";
import thirdPartyNotices from "../legal/third-party-notices.txt?raw";
import { APP_NAME, APP_VERSION, COPYRIGHT_NOTICE, SUPPORT_URL } from "../brand";

/**
 * About & Legal: who owns the app, the terms (LICENSE.txt, shown in full),
 * that it's independent of the Premier League, where its data comes from and
 * who owns that, the privacy notice (PRIVACY.md — keep the two in step), and
 * the open-source notices the bundled packages' licences require
 * (legal/third-party-notices.txt, from `npm run legal:notices`).
 */
export function Legal() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>About &amp; Legal</h1>
          <p className="page-subtitle">
            {APP_NAME} {APP_VERSION} · {COPYRIGHT_NOTICE}
          </p>
        </div>
      </div>

      <div className="legal-page">
        <section className="card">
          <div className="card-title">Independent, not official</div>
          <p>
            {APP_NAME} is an independent project. It is not affiliated with, associated with, authorised by, endorsed by, or in any way
            officially connected with the Premier League, The Football Association Premier League Limited, any football club, or Understat.
            "Premier League", "Fantasy Premier League", "FPL" and the names of clubs are trademarks or names of their respective owners,
            used here only to describe the data shown.
          </p>
        </section>

        <section className="card">
          <div className="card-title">For information only</div>
          <p>
            Every statistic, ranking, colour and prediction (expected points, price changes and the rest) is for information and
            entertainment. It may be inaccurate, incomplete or out of date, and so may the data it's built on. Nothing here is betting,
            financial or other professional advice, and the app is provided as is, without warranty. The full terms are below.
          </p>
        </section>

        <section className="card">
          <div className="card-title">Data sources</div>
          <p>The football data belongs to its owners; {APP_NAME} doesn't claim it.</p>
          <ul>
            <li>
              <strong>Fantasy Premier League</strong> (fantasy.premierleague.com), the game operated by the Premier League: live players,
              prices, fixtures and season histories.
            </li>
            <li>
              <strong>Understat</strong> (understat.com): the violet Understat columns and profile sections.
            </li>
            <li>
              <strong>Vaastav Anand's Fantasy-Premier-League archive</strong> (github.com/vaastav/Fantasy-Premier-League), used under the MIT
              Licence: club history and past-season match logs, 2016/17 to 2025/26.
            </li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Privacy</div>
          <p>
            No accounts, advertising, analytics or tracking, and nothing about you is sent to the developer. Your settings, saved views,
            squads and notes stay on this computer, as do the app's log of what it did and any errors it hit, and its copies of the
            latest FPL and Understat data it downloaded. The app connects only to the Fantasy Premier League data feed (including a team ID you
            type to import a squad), to GitHub for the Understat dataset, and to GitHub Releases for updates; each of those sees your IP
            address under its own privacy policy. The built-in server accepts connections only from this computer.
          </p>
        </section>

        <section className="card">
          <div className="card-title">Contact</div>
          <p>
            Questions about the terms, or permission requests: <span className="legal-url">{SUPPORT_URL}</span>
          </p>
        </section>

        <details className="card legal-details">
          <summary className="card-title">Licence and terms of use</summary>
          <pre className="legal-text">{termsText}</pre>
        </details>

        <details className="card legal-details">
          <summary className="card-title">Open-source software notices</summary>
          <pre className="legal-text">{thirdPartyNotices}</pre>
        </details>
      </div>
    </div>
  );
}
