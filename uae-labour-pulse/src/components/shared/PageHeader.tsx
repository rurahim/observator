import { motion } from 'framer-motion';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const PageHeader = ({ title, subtitle, actions }: PageHeaderProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6"
  >
    <div>
      <h1 className="text-xl font-bold text-primary">{title}</h1>
      {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </motion.div>
);

export default PageHeader;
