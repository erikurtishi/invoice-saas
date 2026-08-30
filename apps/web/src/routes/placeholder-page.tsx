import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';

/**
 * Stand-in for every nav destination until its phase builds the real screen —
 * proves the shell's routing and active-nav-state work end to end. Not a
 * component any later phase extends; delete the route's usage of this and swap
 * in the real page when that phase starts.
 */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Coming in {phase}. This route exists so the layout shell (0.4.3) has somewhere real to
        navigate to.
      </CardContent>
    </Card>
  );
}
