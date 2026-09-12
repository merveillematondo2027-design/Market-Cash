from pathlib import Path

p=Path('functions/src/developerPayments.ts')
s=p.read_text(encoding='utf-8')
old="import { LOCAL_CARD_PREFIX, localCardId, type LocalCardCurrency } from './localCardPair';"
new=old+"\nimport { transactionFee, DEFAULT_TRANSACTION_FEES } from './transactionFees';"
if old not in s and new not in s: raise SystemExit('import pattern missing')
if new not in s: s=s.replace(old,new)

old_func="""async function developerApiPricing() {
  const configured = (await db.doc('app_settings/developer_api_pricing').get()).data() || {};
  const directPercent = Number(configured.directPercent);
  const wholesaleUsd = Number(configured.wholesaleUsd);
  return {
    directPercent: Number.isFinite(directPercent) && directPercent >= 0 && directPercent <= 100 ? directPercent : 2.5,
    wholesaleUsd: roundMoney(Number.isFinite(wholesaleUsd) && wholesaleUsd >= 0 ? wholesaleUsd : 0.05),
  };
}
"""
new_func="""async function developerApiPricing() {
  const [apiPricingSnap, transactionFeesSnap] = await Promise.all([
    db.doc('app_settings/developer_api_pricing').get(),
    db.doc('app_settings/transaction_fees').get(),
  ]);
  const configured = apiPricingSnap.data() || {};
  const feeConfig:any = transactionFeesSnap.data() || {};
  const merchant:any = feeConfig.merchant_payment || {};
  const configuredPercent = Number(merchant.percent);
  const directPercent = merchant.enabled === false ? 0 : Number.isFinite(configuredPercent) && configuredPercent >= 0 && configuredPercent <= 100 ? configuredPercent : DEFAULT_TRANSACTION_FEES.merchant_payment.percent;
  const wholesaleUsd = Number(configured.wholesaleUsd);
  return {
    directPercent,
    wholesaleUsd: roundMoney(Number.isFinite(wholesaleUsd) && wholesaleUsd >= 0 ? wholesaleUsd : 0.05),
  };
}
"""
if old_func in s: s=s.replace(old_func,new_func)
elif new_func not in s: raise SystemExit('pricing function pattern missing')

old_line="const partner=auth.developer.businessType==='api_provider',pricing=await developerApiPricing();"
new_line="const partner=auth.developer.businessType==='api_provider',pricing=await developerApiPricing(),directConfiguredFee=partner?0:await transactionFee('merchant_payment',currency,amount);"
if old_line in s: s=s.replace(old_line,new_line)
elif new_line not in s: raise SystemExit('pricing usage pattern missing')

old_fee="else platformFee=roundMoney(amount*pricing.directPercent/100);"
new_fee="else platformFee=directConfiguredFee;"
if old_fee in s: s=s.replace(old_fee,new_fee)
elif new_fee not in s: raise SystemExit('direct fee pattern missing')

p.write_text(s,encoding='utf-8')
print('Direct developer/API payment now follows Admin merchant_payment fee configuration including minimums and disabled state.')
