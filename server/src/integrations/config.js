export const integrationMode = process.env.INTEGRATION_MODE === 'production' ? 'production' : 'sandbox'
export const kycProvider = process.env.KYC_PROVIDER ?? 'persona'
export const esignProvider = process.env.ESIGN_PROVIDER ?? 'docusign'

export function integrationEnvironment() {
  return integrationMode
}

export function assertSupportedProviders() {
  if (kycProvider !== 'persona') throw new Error(`Unsupported KYC_PROVIDER: ${kycProvider}`)
  if (esignProvider !== 'docusign') throw new Error(`Unsupported ESIGN_PROVIDER: ${esignProvider}`)
}
