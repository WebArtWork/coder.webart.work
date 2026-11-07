import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { CONTACT_EMAIL, SOURCE_URL } from '../../feature/legal/legal.const';

/**
 * The support page: how to reach us and answers to the questions people actually ask.
 * Its translations live in /i18n/pages/support/. Keep it in step with the privacy policy.
 */
@Component({
	imports: [RouterLink, TPipe],
	templateUrl: './support.component.html',
})
export class SupportComponent {
	protected readonly email = CONTACT_EMAIL;
	protected readonly sourceUrl = SOURCE_URL;

	constructor() {
		inject(I18nService).usePage('/i18n/pages/support/');
	}
}
