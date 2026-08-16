import { requireSupabase } from './supabaseClient';
import type { QuotationEstimate, QuotationFormValues, QuotationSector } from './quotationTypes';

/**
 * The public half of the quotation feature: one call, made from the website by visitors who are
 * not signed in. Administrator pricing access lives in quotationAdminRepository.ts so the pricing
 * table and column names are only ever bundled into the lazily loaded admin dashboard chunk.
 */

type EstimateResponse = {
  quotation?: QuotationEstimate;
};

type FunctionError = Error & { context?: Response };

async function readFunctionError(error: FunctionError): Promise<string> {
  try {
    const response = error.context;
    if (!response) return error.message;
    const payload = (await response.clone().json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : error.message;
  } catch {
    return error.message;
  }
}

const toNumber = (value: string) => {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Sends the collected answers to the pricing function. The browser never computes an amount:
 * every rate, multiplier and fee lives on the server, and only the finished line items come back.
 */
export async function requestQuotationEstimate(
  sector: QuotationSector,
  values: QuotationFormValues,
): Promise<QuotationEstimate> {
  const client = await requireSupabase();
  const result = await client.functions.invoke<EstimateResponse>('quotation-estimate', {
    body: {
      action: 'estimate',
      sector,
      input: {
        projectType: values.projectType,
        location: values.location.trim(),
        serviceArea: values.serviceArea,
        floorArea: toNumber(values.floorArea),
        floors: toNumber(values.floors) || 1,
        electricalService: values.electricalService,
        monthlyBill: toNumber(values.monthlyBill),
        estimatedLoadKw: toNumber(values.estimatedLoadKw),
        pvRequired: values.pvRequired,
        systemType: values.systemType,
        pvCapacityKwp: toNumber(values.pvCapacityKwp),
        batteryRequired: values.batteryRequired,
        batteryKwh: toNumber(values.batteryKwh),
        backupRequired: values.backupRequired,
        complexity: values.complexity,
        existingSystem: values.existingSystem,
        additionalRequirements: values.additionalRequirements.trim(),
        clientName: values.clientName.trim(),
        clientContact: values.clientContact.trim(),
        clientEmail: values.clientEmail.trim(),
        projectName: values.projectName.trim(),
      },
    },
  });

  if (result.error) {
    throw new Error(await readFunctionError(result.error as FunctionError));
  }
  if (!result.data?.quotation) {
    throw new Error('The estimate could not be prepared. Please try again.');
  }
  return result.data.quotation;
}
