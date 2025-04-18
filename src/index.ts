import { stringify } from 'query-string';
import {
  Identifier,
  PaginationPayload,
  SortPayload,
  FilterPayload,
  fetchUtils,
  DataProvider,
} from 'ra-core';

import {
  GetListParams,
  GetOneParams,
  GetManyParams,
  GetManyReferenceParams,
  UpdateParams,
  UpdateManyParams,
  CreateParams,
  DeleteParams,
  DeleteManyParams,
} from 'react-admin';

export {
  default as tokenAuthProvider,
  fetchJsonWithAuthToken,
} from './tokenAuthProvider';

export {
  default as jwtTokenAuthProvider,
  fetchJsonWithAuthJWTToken,
} from './jwtTokenAuthProvider';

interface Params {
  id: number;
  data: { [key: string]: any };
  previousData: { [key: string]: any };
}

const getPaginationQuery = (pagination: PaginationPayload) => {
  return {
    page: pagination.page,
    page_size: pagination.perPage,
  };
};

const getFilterQuery = (filter: FilterPayload) => {
  const { q: search, ...otherSearchParams } = filter;
  return {
    ...otherSearchParams,
    search,
  };
};

export const getOrderingQuery = (sort: SortPayload) => {
  const { field, order } = sort;
  return {
    ordering: `${order === 'ASC' ? '' : '-'}${field}`,
  };
};

export default (
  apiUrl: String,
  httpClient: Function = fetchUtils.fetchJson
): DataProvider => {
  const callHttpClientFileHandling = async (
    uri: String,
    method: String,
    data: Partial<any>
  ) => {
    var needFormData = false;
    var body;
    for (const key in data) {
      if (
        data[key] &&
        data[key]['rawFile'] &&
        (data[key]['rawFile'] instanceof Blob ||
          data[key]['rawFile'] instanceof File)
      ) {
        needFormData = true;
      }
    }
    if (needFormData) {
      body = new FormData();
      for (const key in data) {
        if (
          data[key] &&
          data[key]['rawFile'] &&
          data[key]['rawFile'] instanceof Blob
        ) {
          // Append the Blob or File directly without manipulating the name
          body.append(key, data[key].rawFile);
        } else {
          // Append other properties as strings
          body.append(key, data[key]);
        }
      }
    } else {
      body = JSON.stringify(data);
    }

    return await httpClient(uri, {
      method: method,
      body: body,
    });
  };
  const getUrlForId = (resource: String, id: Identifier) => {
    var url: string | String = `${apiUrl}/${resource}/${id}/`;
    if (typeof id === 'string') {
      if (id.startsWith(`${apiUrl}/${resource}/`)) {
        url = id;
      } else if (id.startsWith(`/${resource}/`)) {
        url = `${apiUrl}${id}`;
      }
    }
    return url;
  };
  const getOneJson = (resource: String, id: Identifier) => {
    return httpClient(getUrlForId(resource, id)).then(
      (response: Response) => response.json
    );
  };
  return {
    getList: async (resource: string, params: GetListParams) => {
      const query = {
        ...getFilterQuery(params.filter),
        ...getPaginationQuery(params.pagination!),
        ...getOrderingQuery(params.sort!),
      };
      const url = `${apiUrl}/${resource}/?${stringify(query)}`;

      const { json } = await httpClient(url);

      return {
        data: json.results,
        total: json.count,
      };
    },

    getOne: async (resource: string, params: GetOneParams) => {
      const data = await getOneJson(resource, params.id);
      return {
        data,
      };
    },

    getMany: (resource: string, params: GetManyParams) => {
      return Promise.all(
        params.ids.map(id => getOneJson(resource, id))
      ).then(data => ({ data }));
    },

    getManyReference: async (
      resource: string,
      params: GetManyReferenceParams
    ) => {
      const query = {
        ...getFilterQuery(params.filter),
        ...getPaginationQuery(params.pagination!),
        ...getOrderingQuery(params.sort!),
        [params.target]: params.id,
      };
      const url = `${apiUrl}/${resource}/?${stringify(query)}`;

      const { json } = await httpClient(url);
      return {
        data: json.results,
        total: json.count,
      };
    },

    update: async (resource: string, params: UpdateParams<any>) => {
      // Create a new object that only includes the fields that have changed
      const updatedData = Object.keys(params.data).reduce(
        (result: { [key: string]: any }, key: string) => {
          if (params.data[key] !== params.previousData[key]) {
            result[key] = params.data[key];
          }
          return result;
        },
        {}
      );

      // Include the id in the updatedData
      updatedData.id = params.id;

      const { json } = await callHttpClientFileHandling(
        getUrlForId(resource, params.id),
        'PATCH',
        updatedData
      );

      return { data: json };
    },

    /*
    updateMany updates multiple id's with the same data
    */
    updateMany: (resource: string, params: UpdateManyParams<any>) =>
      Promise.all(
        params.ids.map(id =>
          callHttpClientFileHandling(
            getUrlForId(resource, id),
            'PATCH',
            params.data
          )
        )
      ).then(responses => ({ data: responses.map(({ json }) => json.id) })),
    /*
      bulkUpdate updates multiple id's with different data
      */
    bulkUpdate: async (resource: string, params: Params) => {
      const response = await callHttpClientFileHandling(
        `${apiUrl}/${resource}/`,
        'PATCH',
        params.data
      );

      // Check for a successful response code
      if (response.status >= 200 && response.status < 300) {
        return {
          data: params.data, // Return the data that was sent for confirmation
        };
      } else {
        throw new Error(
          `Failed to bulk update ${resource}: ${response.status}`
        );
      }
    },

    create: async (resource: string, params: CreateParams<any>) => {
      const { json } = await callHttpClientFileHandling(
        `${apiUrl}/${resource}/`,
        'POST',
        params.data
      );
      return {
        data: { ...json },
      };
    },
    submitTask: async (resource: string, params: Params) => {
      const { json } = await callHttpClientFileHandling(
        `${apiUrl}/${resource}/`,
        'POST',
        params.data
      );
      return {
        data: { ...json },
      };
    },

    delete: (resource: string, params: DeleteParams<any>) =>
      httpClient(getUrlForId(resource, params.id), {
        method: 'DELETE',
      }).then(() => ({ data: params.previousData })),

    deleteMany: (resource: string, params: DeleteManyParams) =>
      Promise.all(
        params.ids.map(id =>
          httpClient(getUrlForId(resource, id), {
            method: 'DELETE',
          })
        )
      ).then(() => ({ data: [] })),
  };
};
