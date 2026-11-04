import { Component, inject } from '@angular/core';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { CREDITS, SOURCE_URL } from '../../feature/legal/legal.const';

/** The app's license, its source code and credits for the work it builds on. Translations: /i18n/pages/licenses/. */
@Component({
	imports: [TPipe],
	templateUrl: './licenses.component.html',
})
export class LicensesComponent {
	protected readonly credits = CREDITS;
	protected readonly sourceUrl = SOURCE_URL;
	protected readonly sourceLabel = SOURCE_URL.replace('https://', '');

	constructor() {
		inject(I18nService).usePage('/i18n/pages/licenses/');
	}
}
