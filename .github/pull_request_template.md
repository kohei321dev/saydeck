## Summary

<!-- 変更概要を箇条書きで書く -->

## Related Issue

<!-- Closes # -->

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `DEV_AUTH_BYPASS=1 npm run dev` で `http://localhost:3000` の主要UIを確認した

## OAuth / Deployment

- [ ] PR Preview URLでのOAuthログイン確認を必須にしていない
- [ ] OAuth変更がある場合、merge後にProduction正式ドメインで確認する項目を記載した
- [ ] secret、token、client secret、raw provider payloadを本文や差分に含めていない
