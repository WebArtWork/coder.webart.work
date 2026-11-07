import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACT_EMAIL } from '../../feature/legal/legal.const';

/**
 * The privacy policy. Keep it in step with what the app stores: the account feature
 * (src/app/feature/account), firestore.rules and the browser storage used for language and theme.
 */
@Component({
	imports: [RouterLink],
	templateUrl: './privacy.component.html',
})
export class PrivacyComponent {
	protected readonly updated = '7 November 2026';
	protected readonly email = CONTACT_EMAIL;
}
