import ProductionDashboard from '@/components/productions/ProductionDashboard';

interface Props {
  params: Promise<{ prodKey: string }>;
}

export default async function ProductionDashboardPage({ params }: Props) {
  const { prodKey } = await params;
  return <ProductionDashboard prodKey={decodeURIComponent(prodKey)} />;
}
