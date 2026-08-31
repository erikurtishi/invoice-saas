import { ArrowLeft } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppFooter } from '../../components/layout/app-footer';
import { LanguageSwitcher } from '../../components/layout/language-switcher';
import { LEGAL_DOCUMENTS, type LegalDocId, type LegalSection } from './legal-content';

/**
 * Renders the privacy policy or the terms of service (backlog X.4.1 / X.4.2).
 * Public — no shell, no session needed; reachable from the footer everywhere.
 * The document body is English-only for now (see `legal-content.ts`); the chrome
 * is translated, and a notice explains the gap when the app is set to SQ / MK.
 */
export function LegalPage({ doc }: { doc: LegalDocId }) {
  const { t, i18n } = useTranslation();
  const content = LEGAL_DOCUMENTS[doc];
  const title = doc === 'privacy' ? t('legal.privacyTitle') : t('legal.termsTitle');
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const englishOnly = !lang.startsWith('en');

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('legal.backToApp')}
          </Link>
          <LanguageSwitcher className="w-36" />
        </div>

        <article className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('legal.effectiveDate', { date: content.effectiveDate })}
          </p>

          <div className="mt-4 rounded-md border border-warning bg-warning/40 px-3 py-2 text-xs text-warning-foreground">
            {t('legal.draftNotice')}
          </div>
          {englishOnly && (
            <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t('legal.translationNotice')}
            </div>
          )}

          <p className="mt-5 text-sm leading-relaxed text-foreground">{content.summary}</p>

          <div className="mt-6 flex flex-col gap-6">
            {content.sections.map((section, i) => (
              <Section key={i} index={i + 1} section={section} />
            ))}
          </div>
        </article>
      </div>
      <AppFooter />
    </div>
  );
}

/** Renders a section's paragraphs, grouping runs of "- " lines into one list. */
function Section({ index, section }: { index: number; section: LegalSection }) {
  const groups: { bullet: boolean; items: string[] }[] = [];
  for (const para of section.body) {
    const bullet = para.startsWith('- ');
    const text = bullet ? para.slice(2) : para;
    const last = groups[groups.length - 1];
    if (last && last.bullet === bullet) last.items.push(text);
    else groups.push({ bullet, items: [text] });
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{`${index}. ${section.heading}`}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
        {groups.map((group, gi) =>
          group.bullet ? (
            <ul key={gi} className="ml-4 flex list-disc flex-col gap-1">
              {group.items.map((item, ii) => (
                <li key={ii}>{item}</li>
              ))}
            </ul>
          ) : (
            <Fragment key={gi}>
              {group.items.map((item, ii) => (
                <p key={ii}>{item}</p>
              ))}
            </Fragment>
          ),
        )}
      </div>
    </section>
  );
}
