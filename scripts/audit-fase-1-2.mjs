#!/usr/bin/env node
/**
 * AUDITORÍA FASES 1 Y 2 - Módulo de Finanzas
 * Casa-14: Morosidad, suspensión, agua, línea presupuestaria
 *
 * Ejecutar: node scripts/audit-fase-1-2.mjs
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

const report = {
  timestamp: new Date().toISOString(),
  condominium: null,
  fase1: { title: 'Morosidad y Suspensión', findings: [] },
  fase2: { title: 'Agua y Línea Presupuestaria', findings: [] },
  summary: {},
};

async function auditarCasa14() {
  try {
    console.log('🏗️  AUDITORÍA FASES 1 Y 2 - ANEXYpro Finanzas\n');
    console.log('Buscando CASA-14...\n');

    // Buscar CASA-14
    const condo = await prisma.condominium.findFirst({
      where: { nombre: { contains: 'CASA-14', mode: 'insensitive' } },
      include: {
        properties: {
          include: {
            charges: { orderBy: { createdAt: 'desc' } },
            serviceManualSuspension: true,
            waterReadings: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
        company: true,
      },
    });

    if (!condo) {
      console.error('❌ No se encontró CASA-14');
      process.exit(1);
    }

    report.condominium = {
      id: condo.id,
      nombre: condo.nombre,
      empresa: condo.company.nombre,
      fechaCreacion: condo.createdAt,
    };

    console.log(`✅ Encontrado: ${condo.nombre} (${condo.id})`);
    console.log(`   Empresa: ${condo.company.nombre}`);
    console.log(`   Filiales: ${condo.properties.length}\n`);

    // ============================================
    // FASE 1: MOROSIDAD Y SUSPENSIÓN
    // ============================================
    console.log('═══════════════════════════════════════════');
    console.log('FASE 1: MOROSIDAD Y SUSPENSIÓN');
    console.log('═══════════════════════════════════════════\n');

    // 1.1 Verificar vista de saldos
    const vista = await prisma.$queryRaw`
      SELECT p.id, p.numero, p.ownerName,
             SUM(CASE WHEN c.status NOT IN ('pagado', 'cancelado') THEN c.amount ELSE 0 END) as saldo
      FROM properties p
      LEFT JOIN charges c ON c.propertyId = p.id
      WHERE p.condominiumId = ${condo.id}
      GROUP BY p.id, p.numero, p.ownerName
      ORDER BY saldo DESC
    `;

    console.log('📊 Saldos por filial (de BD - sin vistas):');
    let totalMoroso = 0;
    let filialMorosa = null;
    vista.forEach((fila, i) => {
      const saldo = Number(fila.saldo) || 0;
      const estado = saldo > 0 ? '❌ EN MORA' : '✅ AL DÍA';
      console.log(`   ${i + 1}. Filial ${fila.numero} (${fila.ownerName}): ₡${saldo.toLocaleString('es-CR')} ${estado}`);
      if (saldo > 0) {
        totalMoroso += saldo;
        if (!filialMorosa) filialMorosa = { numero: fila.numero, id: fila.id };
      }
    });
    console.log(`\n   📈 Total en mora: ₡${totalMoroso.toLocaleString('es-CR')}`);
    console.log(`   📊 Filiales en mora: ${vista.filter(f => Number(f.saldo) > 0).length} / ${vista.length}\n`);

    report.fase1.findings.push({
      name: 'Cálculo de saldos',
      status: totalMoroso > 0 ? 'ACTIVO' : 'OK',
      detail: `${vista.filter(f => Number(f.saldo) > 0).length} filiales en mora por ₡${totalMoroso.toLocaleString('es-CR')}`,
    });

    // 1.2 Verificar suspensión manual
    console.log('🔒 Suspensiones manuales registradas:');
    const suspensiones = await prisma.propertyServiceSuspension.findMany({
      where: { property: { condominiumId: condo.id }, endedAt: null },
      include: { property: true },
    });

    if (suspensiones.length === 0) {
      console.log('   ✅ No hay suspensiones manuales activas\n');
      report.fase1.findings.push({
        name: 'Suspensión manual',
        status: 'OK',
        detail: 'Ninguna suspensión manual activa',
      });
    } else {
      suspensiones.forEach((susp) => {
        console.log(`   ❌ Filial ${susp.property.numero}: suspendida desde ${susp.createdAt}`);
      });
      console.log();
      report.fase1.findings.push({
        name: 'Suspensión manual',
        status: 'ACTIVA',
        detail: `${suspensiones.length} suspensiones manuales registradas`,
      });
    }

    // 1.3 Verificar eventos de suspensión
    console.log('📝 Eventos de suspensión en bitácora:');
    const eventos = await prisma.propertyEvent.findMany({
      where: {
        property: { condominiumId: condo.id },
        type: { in: ['suspension_activada', 'suspension_levantada'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { property: true },
    });

    if (eventos.length === 0) {
      console.log('   ℹ️  No hay eventos de suspensión registrados\n');
    } else {
      eventos.forEach((evt) => {
        const tipo = evt.type === 'suspension_activada' ? '🔒 Suspendida' : '🔓 Levantada';
        console.log(`   ${tipo} - Filial ${evt.property.numero}: ${evt.createdAt.toISOString()}`);
      });
      console.log();
    }

    report.fase1.findings.push({
      name: 'Eventos en bitácora',
      status: eventos.length > 0 ? 'REGISTRADO' : 'VACÍO',
      detail: `${eventos.length} eventos de suspensión`,
    });

    // ============================================
    // FASE 2: AGUA Y LÍNEA PRESUPUESTARIA
    // ============================================
    console.log('═══════════════════════════════════════════');
    console.log('FASE 2: AGUA Y LÍNEA PRESUPUESTARIA');
    console.log('═══════════════════════════════════════════\n');

    // 2.1 Verificar configuración de agua
    console.log('💧 Configuración de cobro de agua:');
    const waterConfig = await prisma.waterConfig.findFirst({
      where: { condominiumId: condo.id },
    });

    if (!waterConfig) {
      console.log('   ℹ️  No configurado\n');
      report.fase2.findings.push({
        name: 'Configuración agua',
        status: 'NO CONFIGURADO',
        detail: 'Sin tarifa de agua',
      });
    } else {
      console.log(`   ✅ Modo: ${waterConfig.mode}`);
      if (waterConfig.mode === 'escalonado') {
        const tiers = JSON.parse(waterConfig.tariffTiers || '[]');
        console.log(`   📊 Tramos configurados:`);
        tiers.forEach((tier, i) => {
          console.log(`      ${i + 1}. Hasta ${tier.maxM3} m³ @ ₡${tier.ratePerM3}/m³`);
        });
      } else if (waterConfig.mode === 'tarifa_plana') {
        console.log(`   💰 Tarifa plana: ₡${waterConfig.flatFee}`);
      }
      console.log();

      report.fase2.findings.push({
        name: 'Configuración agua',
        status: 'CONFIGURADO',
        detail: `Modo ${waterConfig.mode}`,
      });
    }

    // 2.2 Verificar lecturas de agua
    console.log('📖 Lecturas de agua registradas:');
    const lecturas = await prisma.waterReading.findMany({
      where: { property: { condominiumId: condo.id } },
      orderBy: { period: 'desc' },
      take: 10,
      include: { property: true, charge: true },
    });

    if (lecturas.length === 0) {
      console.log('   ℹ️  No hay lecturas registradas\n');
      report.fase2.findings.push({
        name: 'Lecturas de agua',
        status: 'VACÍO',
        detail: 'Sin registros',
      });
    } else {
      lecturas.slice(0, 5).forEach((lectura) => {
        console.log(`   Filial ${lectura.property.numero} - Período ${lectura.period}:`);
        console.log(`      Lectura: ${lectura.m3} m³`);
        console.log(`      Cargo: ${lectura.charge ? '✅ Generado' : '❌ Sin cargo'}`);
      });
      console.log();

      report.fase2.findings.push({
        name: 'Lecturas de agua',
        status: 'REGISTRADO',
        detail: `${lecturas.length} lecturas`,
      });
    }

    // 2.3 Verificar línea presupuestaria en gastos
    console.log('📋 Gastos con línea presupuestaria override:');
    const gastos = await prisma.expense.findMany({
      where: { condominiumId: condo.id, budgetLineId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { budgetLine: true, category: true },
    });

    if (gastos.length === 0) {
      console.log('   ℹ️  No hay gastos con override de línea presupuestaria\n');
      report.fase2.findings.push({
        name: 'Línea presupuestaria',
        status: 'VACÍO',
        detail: 'Sin overrides',
      });
    } else {
      gastos.slice(0, 5).forEach((gasto) => {
        console.log(`   ${gasto.description}`);
        console.log(`      Categoría: ${gasto.category?.name || 'N/A'}`);
        console.log(`      Línea: ${gasto.budgetLine?.name || 'N/A'}`);
        console.log(`      Monto: ₡${Number(gasto.amount).toLocaleString('es-CR')}`);
      });
      console.log();

      report.fase2.findings.push({
        name: 'Línea presupuestaria',
        status: 'ACTIVO',
        detail: `${gastos.length} gastos con override`,
      });
    }

    // 2.4 Verificar permiso agua_config
    console.log('🔐 Permisos de configuración de agua:');
    const users = await prisma.staffPermissions.findMany({
      where: {
        user: { company: { id: condo.companyId } },
      },
      include: { user: true },
    });

    let withWaterPermission = 0;
    users.forEach((perm) => {
      if (perm.agua_config !== false) {
        withWaterPermission++;
      }
    });

    console.log(`   ${withWaterPermission} usuario(s) con permiso agua_config\n`);
    report.fase2.findings.push({
      name: 'Permiso agua_config',
      status: 'OK',
      detail: `${withWaterPermission} usuarios autorizados`,
    });

    // ============================================
    // RESUMEN
    // ============================================
    console.log('═══════════════════════════════════════════');
    console.log('RESUMEN');
    console.log('═══════════════════════════════════════════\n');

    const criticalFindings = [
      ...report.fase1.findings.filter(f => f.status === 'CRÍTICO' || f.status === 'ERROR'),
      ...report.fase2.findings.filter(f => f.status === 'CRÍTICO' || f.status === 'ERROR'),
    ];

    const activeFindings = [
      ...report.fase1.findings.filter(f => f.status === 'ACTIVO' || f.status === 'REGISTRADO'),
      ...report.fase2.findings.filter(f => f.status === 'ACTIVO' || f.status === 'REGISTRADO'),
    ];

    console.log(`Fase 1 (Morosidad): ${report.fase1.findings.length} verificaciones`);
    console.log(`Fase 2 (Agua): ${report.fase2.findings.length} verificaciones`);
    console.log(`\n🔴 Hallazgos críticos: ${criticalFindings.length}`);
    console.log(`🟡 Situaciones activas: ${activeFindings.length}`);
    console.log(`✅ Verificaciones OK: ${report.fase1.findings.filter(f => f.status === 'OK').length + report.fase2.findings.filter(f => f.status === 'OK').length}`);

    // Guardar reporte
    const reportPath = '/Users/andres/Downloads/ANEXYpro/anexypro-app 10/audit-report-fase-1-2.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Reporte guardado: ${reportPath}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

auditarCasa14();
