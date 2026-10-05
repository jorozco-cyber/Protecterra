# Protecterra

App privada para llevar inventario por lotes (FIFO), compras, ventas, cobros, cuentas por cobrar y por pagar, y comisiones. Reemplaza la app que estaba en Knack.

## Quién entra

- **Administrador**: ve y opera todo. Los correos de administrador están en la configuración de la base de datos.
- **Vendedor**: portal de solo consulta con sus ventas, los saldos de sus clientes y sus comisiones. No ve costos ni utilidades. El administrador activa el portal desde Comisiones → Editar vendedor.
- Cualquier otra cuenta ve una pantalla de "Sin acceso".

El permiso lo decide la base de datos, no la pantalla: aunque alguien llame a la base directamente, solo recibe lo que su rol permite.

## Reglas principales

- Cada venta toma los lotes más viejos primero y reparte entre lotes si hace falta. El costo sale del lote.
- No se puede vender más de lo que hay, repetir número de factura, ni usar un lote comprado después de la fecha de la venta.
- Vender por debajo del costo pide autorización explícita.
- "Pagado" y "pendiente" se calculan del saldo.
- Nada se borra: ventas, cobros, compras y pagos se anulan con motivo y quedan en el registro de cambios.
- Cada venta guarda el porcentaje de comisión con el que se hizo.

## Estructura

- `app/` páginas y acceso. `components/admin/` pantallas del administrador. `components/seller/` portal del vendedor.
- `lib/calc.ts` cálculos compartidos (vista previa FIFO, antigüedad de cartera, resumen mensual).
- `supabase/migrations/` base de datos: tablas, migración desde Knack, permisos y operaciones.
- `supabase/tests/operations.sql` pruebas de las reglas (corre en una transacción y no guarda nada).
- `tests/` pruebas de los cálculos: `pnpm test`.

## Configuración

Variables de entorno (ver `.env.example`): la dirección del proyecto de Supabase y su llave pública. No se usa ninguna llave secreta.

## Datos de Knack

El historial se copió a un respaldo de solo lectura y de ahí a las tablas nuevas. La migración se puede repetir para traer lo más reciente sin duplicar. En Knack nunca se escribe.
