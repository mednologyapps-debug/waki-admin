import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { buildHotelAffiliationContract, contractPlanTerms } from '../src/lib/hotelAffiliationContract.js'

const hotel = {
  name: 'Hotel Prueba',
  address: 'Av. Ejemplo 123',
  contact_email: 'hotel@example.com',
  hotel_brands: { legal_name: 'Prueba Hoteles S.A.C.', ruc: '20123456789' },
}

assert.equal(contractPlanTerms('socio').commission, '8 % + IGV aplicable a la comisión')
assert.equal(contractPlanTerms('socio').monthly, 'S/ 99 + IGV por mes')
assert.equal(contractPlanTerms('flexible').commission, '12 % + IGV aplicable a la comisión')
assert.equal(contractPlanTerms('flexible').monthly, 'Sin cuota mensual')
await assert.rejects(() => buildHotelAffiliationContract({ hotel, planCode: '', representativeEmail: hotel.contact_email }), /HOTEL_PLAN_REQUIRED/)
await assert.rejects(() => buildHotelAffiliationContract({ hotel: { ...hotel, hotel_brands: {} }, planCode: 'socio' }), /HOTEL_LEGAL_DETAILS_REQUIRED/)

for (const planCode of ['socio', 'flexible']) {
  const bytes = await buildHotelAffiliationContract({ hotel, planCode, representativeEmail: hotel.contact_email })
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 4)
  assert.ok(bytes.byteLength > 4000)
}

console.log('Contrato WAKI: 2 planes + IGV, datos legales requeridos y PDF individual de 4 páginas válidos.')
