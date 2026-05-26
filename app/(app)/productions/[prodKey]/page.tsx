import ProductionDashboard from '@/components/productions/ProductionDashboard';

export default function ProductionDashboardPage({ params }: { params: { prodKey: string } }) {
  return <ProductionDashboard prodKey={params.prodKey} />;
}
