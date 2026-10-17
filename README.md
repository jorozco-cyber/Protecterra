# Protecterra

App privada para llevar inventario por lotes (FIFO), compras, ventas, cobros, cuentas por cobrar y por pagar, y comisiones. Reemplaza la app que estaba en Knack.

## Dos empresas

La misma app lleva **ProtecTerra** e **Importagro**. Quien administra las dos ve un selector arriba del menú; cada empresa tiene sus propios productos, lotes, compras, ventas, cobros, clientes, vendedores, comisiones y archivos, y nada se mezcla.

- Las pantallas son las mismas. En la base de datos, Importagro usa tablas y funciones propias con prefijo `ia_` (las de ProtecTerra son `pt_`) y su propio almacén de archivos. `lib/company.ts` decide cuáles se usan.
- Importagro se lleva en dólares y con el IVA aparte: precios y costos se escriben sin IVA, y cada venta y cada compra guarda su porcentaje (configuración `tax_rate`, hoy 15 %) y lo suma al total a cobrar o pagar. La utilidad y la comisión se calculan sobre el subtotal sin IVA.
- Importagro todavía no tiene portal del vendedor ni recibos de comisión con firma; las comisiones se pagan directo desde Comisiones.
- Sus tablas se crearon copiando la estructura y las reglas vigentes de ProtecTerra, y su historial se cargó una sola vez desde el respaldo de Knack. Las dos migraciones quedaron en el historial de Supabase: `importagro_clone_protecterra_structure` e `importagro_iva_and_history_loader`. Un cambio de reglas en ProtecTerra no pasa solo a Importagro: hay que aplicarlo en las dos.

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

## Archivos

Facturas, recibos y comprobantes se guardan en un almacén privado propio. Solo el administrador los abre (con una dirección temporal) y los sube desde el detalle de la venta, la compra, el cobro o el pago. Reemplazar un archivo no borra el anterior.

Los archivos que venían de Knack se copian con `supabase/functions/pt-copy-files`: corre sola por tandas, comprueba el tamaño de cada archivo y se detiene cuando no queda ninguno. Necesita una clave guardada en el vault (`pt_files_job_token`); al borrarla queda apagada.

## Recibos de comisión con firma

En Comisiones se marcan las facturas listas para pago y se usa «Enviar para firma». Se crea un recibo con una foto fija de esas facturas y un enlace privado (`/firmar/…`). El enlace pide iniciar sesión: lo ve el administrador o el vendedor dueño del recibo, y solo ese vendedor puede firmarlo. Revisa, firma con el dedo y queda registrado quién firmó, cuándo y desde qué dirección. El PDF firmado se guarda solo en el almacén. Después se registra el pago desde el mismo recibo.

La firma del administrador se dibuja una vez en «Mi firma» y sale precargada. El correo con el enlace se envía con Resend si están las variables `RESEND_API_KEY` y `RESEND_FROM`; sin ellas, el enlace se comparte a mano.

## Firma de facturas por el cliente

En el detalle de una venta con factura digital, «Enviar para firma» abre la factura: se toca el lugar del campo de firma (el recuadro amarillo; se puede hacer más ancho, angosto, alto o bajo) y se crea un enlace privado (`/factura/…`). La app recuerda ese lugar para las siguientes facturas de la empresa. El enlace se comparte por WhatsApp, se copia o, si el cliente tiene correo, se envía con Resend.

El cliente no necesita cuenta: abre el enlace, ve su factura con el campo marcado, escribe su nombre completo y su cédula (formato nicaragüense, se guarda como 001-010190-0001A), firma con el dedo y marca su conformidad. Queda registrado quién, cuándo y desde qué dirección y dispositivo. El enlace vence a los 7 días, sirve una sola vez y se puede anular; si se crea uno nuevo, el anterior deja de servir. Una firma ya hecha también se puede anular para pedir otra (no se borra: queda en el registro de cambios).

La copia firmada se arma sola en la app del administrador la próxima vez que la abre: cada página de la factura original tal como se ve, con la firma en su campo, más una hoja final de constancia (datos de la factura, firmante, cédula, fecha y hora de Nicaragua, dirección y dispositivo, lo que declaró y la huella SHA-256 del archivo original). Se guarda en el almacén junto a la factura original, que no se toca. Al firmar, el cliente también puede descargar su copia.

Para mostrar la factura y armar la copia se usa pdf.js de Mozilla (copia fija en `public/vendor/pdfjs`, versión y origen en su README). El cliente ve la factura con una dirección temporal del almacén que dura 8 días.

## Datos de Knack

El historial se copió a un respaldo de solo lectura y de ahí a las tablas nuevas. La migración se puede repetir para traer lo más reciente sin duplicar, y no pisa los archivos que ya están en el almacén propio. En Knack nunca se escribe.
