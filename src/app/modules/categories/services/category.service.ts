import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { CATEGORY, ENVIRONMENT } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  constructor(private http: HttpClient) {}

  listCategories(params: IParams) {
    return this.http
      .get(
        CATEGORY.LIST +
          `/${params.orgId}` +
          `/${params.pageNumber}/${params.limit}`
      )
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  addCategory(categoryForm: FormGroup) {
    const { name, description, organisation, environments, config } =
      categoryForm.value;
    return this.http
      .post(CATEGORY.ADD, {
        name,
        description,
        organisation,
        environments,
        config,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deleteCategory(orgId: string, id: string) {
    return this.http.delete(CATEGORY.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  viewCategory(orgId: string, categoryId: string) {
    return this.http.get(CATEGORY.VIEW + `${orgId}/${categoryId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }

  editEnvironment(envForm: FormGroup) {
    const { id, name, description, status } = envForm.getRawValue();
    return this.http
      .put(ENVIRONMENT.EDIT, {
        id,
        name,
        description,
        status: status ? 1 : 0,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  editCategory(categoryData: any) {
    const {
      id,
      name,
      description,
      environments,
      status,
      config,
      organisation,
    } = categoryData;
    return this.http
      .put(CATEGORY.EDIT, {
        id,
        name,
        description,
        environments,
        status,
        config,
        organisation,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
