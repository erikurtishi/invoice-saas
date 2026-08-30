import { useBusinessProfile } from '../../features/profile/use-profile';
import { BusinessProfileForm } from '../../components/profile/business-profile-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Business profile',
  description:
    'Your business details and the defaults applied to every new invoice. You can change these any time.',
} as const;

/**
 * Settings → Business profile (backlog 1.2.5 — edit everything from 1.2.2 / 1.2.3
 * later). All five UI states come from `<QueryBoundary>`: skeleton while the
 * profile loads, inline error + retry if it fails, the form on success. The
 * profile always exists for an authenticated user, so there is no empty state; the
 * logo control carries its own independent state (partial).
 */
export function BusinessProfilePage() {
  const query = useBusinessProfile();

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{COPY.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={query} loading={<SkeletonForm fields={8} />}>
            {(profile) => <BusinessProfileForm profile={profile} />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
