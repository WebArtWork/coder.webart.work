import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon.component';
import { CompanyService } from '../../feature/company/company.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { NavStateService } from '../nav-state.service';
import { NAV_LINKS } from '../nav.const';

@Component({
	selector: 'app-footer',
	imports: [IconComponent, RouterLink, TPipe],
	templateUrl: './footer.component.html',
})
export class FooterComponent {
	protected readonly company = inject(CompanyService).company;
	protected readonly links = NAV_LINKS;
	protected readonly nav = inject(NavStateService);
	protected readonly year = new Date().getFullYear();
}
