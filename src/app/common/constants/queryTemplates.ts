export const QUERY_TEMPLATE = [
  { name: 'Blank', value: '' },
  {
    name: 'Default',
    value:
      'SELECT\nDISTINCT uci.enterprise_id,\nuci.case_id,\nuci.case_num,\nuei.seq_num evt_seq_num,\nupi.seq_num prod_seq_num,\nurrid.reg_report_id\nFROM\nuan_dwh_edw.uan_case_info uci,\nuan_dwh_edw.uan_event_info uei,\nuan_dwh_edw.uan_product_info upi,\n(\nSELECT\nuci.case_id,\nuci.enterprise_id,\nuci.client_id,\nuci.version_num,\nurr.reg_report_id\nFROM\nuan_dwh_edw.uan_case_info uci\nLEFT OUTER JOIN uan_dwh_edw.uan_reg_reports urr ON\nuci.case_id = urr.case_id\nAND uci.enterprise_id = urr.enterprise_id\nAND uci.client_id = urr.client_id\nAND uci.version_num = urr.version_num\n) urrid\nWHERE\nuci.case_id = uei.case_id\nAND uci.enterprise_id = uei.enterprise_id\nAND uci.client_id = uei.client_id\nAND uci.version_num = uei.version_num\nAND uci.case_id = upi.case_id\nAND uci.enterprise_id = upi.enterprise_id\nAND uci.client_id = upi.client_id\nAND uci.version_num = upi.version_num\nAND uci.case_id = urrid.case_id\nAND uci.enterprise_id = urrid.enterprise_id\nAND uci.client_id = urrid.client_id\nAND uci.version_num = urrid.version_num',
  },
  // {
  //   name: 'Event Level',
  //   value:
  //     'select\ndistinct uci.case_num\nfrom\nuan_dwh_edw.uan_case_info uci,\nuan_dwh_edw.uan_event_info uei\nwhere\nuci.case_id = uei.case_id\nand uci.enterprise_id = uei.enterprise_id\nand uci.client_id = uei.client_id\nand uci.version_num = uei.version_num',
  // },
  // {
  //   name: 'Product Level',
  //   value:
  //     'select\ndistinct uci.case_num\nfrom\nuan_dwh_edw.uan_case_info uci,\nuan_dwh_edw.uan_product_info upi\nwhere\nuci.case_id = upi.case_id\nand uci.enterprise_id = upi.enterprise_id\nand uci.client_id = upi.client_id\nand uci.version_num = upi.version_num',
  // },
  // {
  //   name: 'Product-Event Level',
  //   value:
  //     'select\ndistinct uci.case_num\nfrom\nuan_dwh_edw.uan_case_info uci,\nuan_dwh_edw.uan_event_info uei,\nuan_dwh_edw.uan_case_event_product ucep,\nuan_dwh_edw.uan_product_info upi\nwhere\nuci.case_id = uei.case_id\nand uci.enterprise_id = uei.enterprise_id\nand uci.client_id = uei.client_id\nand uci.version_num = uei.version_num\nand uei.case_id = ucep.case_id\nand uei.enterprise_id = ucep.enterprise_id\nand uei.client_id = ucep.client_id\nand uei.version_num = ucep.version_num\nand uei.seq_num = ucep.event_seq_num\nand ucep.case_id = upi.case_id\nand ucep.enterprise_id = upi.enterprise_id\nand ucep.client_id = upi.client_id\nand ucep.version_num = upi.version_num\nand ucep.prod_seq_num = upi.seq_num',
  // },
  // {
  //   name: 'Submission Level',
  //   value:
  //     'select\ndistinct uci.case_num\nfrom\nuan_dwh_edw.uan_case_info uci,\nuan_dwh_edw.uan_reg_reports urr\nwhere\nurr.case_id = uci.case_id and\nurr.enterprise_id = uci.enterprise_id and\nurr.client_id = uci.client_id and\nurr.version_num = uci.version_num',
  // },
];
