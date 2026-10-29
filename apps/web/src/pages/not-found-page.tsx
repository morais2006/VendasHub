import { Link } from 'react-router';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Página não encontrada"
      description="O endereço pode ter mudado ou o registro não existe mais."
      action={
        <Button asChild size="sm">
          <Link to="/">Ir para o painel</Link>
        </Button>
      }
    />
  );
}
