import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
	providedIn: 'root',
})
export class DialogService {
	constructor() {}

	openDeleteConfirmDialog() {
		const result = Swal.fire({
			title: 'Are you sure?',
			text: "You won't be able to revert!",
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#34c38f',
			cancelButtonColor: '#f46a6a',
			confirmButtonText: 'Yes, delete !',
			allowOutsideClick: false,
			showCloseButton: true,
		});
		return result;
	}

	openBackConfirmDialog() {
		const result = Swal.fire({
			title: 'Are you sure?',
			text: "You won't be able to revert!",
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#34c38f',
			cancelButtonColor: '#f46a6a',
			confirmButtonText: 'Yes',
			allowOutsideClick: false,
			showCloseButton: true,
		});
		return result;
	}

	enterSiteDetailsConfirmDialog() {
		const result = Swal.fire({
			title: 'Site Details Required!',
			text: 'Enter site details to proceed!',
			icon: 'warning',
			showCancelButton: false,
			confirmButtonColor: '#34c38f',
			confirmButtonText: 'Okay',
			allowOutsideClick: false,
			showCloseButton: false,
		});
		return result;
	}

	saveSiteDetailsFirst() {
		const result = Swal.fire({
			title: 'Update site data!',
			text: 'Update site details to proceed!',
			icon: 'warning',
			showCancelButton: false,
			confirmButtonColor: '#34c38f',
			confirmButtonText: 'Okay',
			allowOutsideClick: false,
			showCloseButton: false,
		});
		return result;
	}

	openCancelOrderConfirmDialg() {
		const result = Swal.fire({
			title: 'Are you sure you want to cancel?',
			text: "You won't be able to revert!",
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#34c38f',
			cancelButtonColor: '#f46a6a',
			confirmButtonText: 'Yes, cancel !',
			allowOutsideClick: false,
			showCloseButton: true,
		});
		return result;
	}
}
