import { inject, Service } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { LoadingService } from '../loading/loading.service';
import { ShareService } from '../share/share.service';
import { SharedSystemsService } from './shared-systems.service';
import { SystemItem } from './systems.model';
import { SystemsService } from './systems.service';

/**
 * Shares a system as a read-only link, /shared/<id>. The long id is made once, the first time, and kept on the
 * system; every later share refreshes the same copy and gives the same link.
 */
@Service()
export class SystemShareService {
	private readonly _auth = inject(AuthService);
	private readonly _loading = inject(LoadingService);
	private readonly _share = inject(ShareService);
	private readonly _shared = inject(SharedSystemsService);
	private readonly _systems = inject(SystemsService);

	/** Publishes the system as it is now, then shares or copies its link. Resolves true once the link went out. */
	async share(item: SystemItem): Promise<boolean> {
		const user = this._auth.user() ?? (await this._auth.whenReady());
		if (!user) return false;
		const shareId = item.shareId ?? this._shared.newId();
		try {
			await this._loading.track(async () => {
				await this._shared.publish(shareId, user.uid, item);
				if (!item.shareId) this._systems.setShareId(item.id, shareId);
			});
		} catch (error) {
			console.error('Could not share the system.', error);
			return false;
		}
		this._share.shareLink(this._share.urlOf('/shared/' + shareId), item.name);
		return true;
	}
}
