import type {CmsConfig} from './api/cms';

/** Surface-specific assets fall back to the existing shared logo. */
export function organizationLogo(config:CmsConfig,surface:'light'|'dark',fallback?:string):string {
 const specific=surface==='light'?config.logoOnLight:config.logoOnDark;
 const shared=config.logo==='/logo-header.png'&&surface==='light'?null:config.logo;
 return specific||shared||fallback||(surface==='light'?'/logo-call-sheet.png':'/logo-header.png');
}
