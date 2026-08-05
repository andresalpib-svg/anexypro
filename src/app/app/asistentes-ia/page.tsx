import Link from 'next/link';
import { Scale, TrendingUp, MessageSquareText, Wrench, Sparkles, BarChart3, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

const ASSISTANTS = [
  {
    icon: Scale,
    title: 'Árbitro Legal IA',
    desc: 'Consultas de residentes sobre el reglamento — vive en el Ecosistema Condómino, fundamentado en el texto real que cargues en Documentos.',
    href: null,
    note: 'Portal del residente',
  },
  {
    icon: TrendingUp,
    title: 'Analista Financiero',
    desc: 'Los estados financieros y el análisis de cuentas ya viven en Contabilidad Inteligente — no se duplica aquí.',
    href: '/app/contabilidad',
  },
  {
    icon: MessageSquareText,
    title: 'Asistente Administrativo',
    desc: 'Preguntas sobre el estado actual de tu condominio, fundamentadas en datos reales.',
    href: '/app/asistentes-ia/administrativo',
  },
  {
    icon: Wrench,
    title: 'Asistente de Mantenimiento',
    desc: 'Detecta activos con reparaciones recurrentes que conviene evaluar para reemplazo.',
    href: '/app/asistentes-ia/mantenimiento',
  },
  {
    icon: Sparkles,
    title: 'Generador de Comunicados',
    desc: 'Redacta un primer borrador a partir de una instrucción — siempre lo revisas antes de guardar.',
    href: '/app/comunicados/nuevo',
  },
  {
    icon: BarChart3,
    title: 'Generador de Reportes',
    desc: 'Explica en lenguaje natural los datos reales de cada reporte.',
    href: '/app/reportes',
  },
  {
    icon: Search,
    title: 'Buscador Inteligente',
    desc: 'Condominios, unidades, documentos, tickets, asambleas y proyectos en un solo lugar.',
    href: '/app/asistentes-ia/buscador',
  },
];

export default function AsistentesIAHubPage() {
  return (
    <div>
      <PageHeader title="Asistentes IA" subtitle="Cada asistente fundamentado en datos reales — ninguno fabrica respuestas" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ASSISTANTS.map((a) => {
          const Icon = a.icon;
          const content = (
            <>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-grad-lumen text-white">
                <Icon size={20} />
              </span>
              <p className="mt-3 font-sans text-base font-bold text-ink">{a.title}</p>
              <p className="mt-1 text-sm text-muted">{a.desc}</p>
              {a.note && <span className="chip bg-royal-soft text-royal mt-2">{a.note}</span>}
            </>
          );
          return a.href ? (
            <Link key={a.title} href={a.href} className="card block p-5 hover:-translate-y-0.5 hover:shadow-lg">
              {content}
            </Link>
          ) : (
            <div key={a.title} className="card p-5 opacity-90">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
