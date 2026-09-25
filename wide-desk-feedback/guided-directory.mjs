// LOCAL DEMO DATA. Replace after the owner supplies the real directory.
export const DIRECTORY = {
  sample: true,
  departments: [
    {id:'sales',name:'営業',reading:'えいぎょう',people:[
      {id:'sample-yamada',name:'山田太郎',reading:'やまだたろう'},
      {id:'sample-sales',name:'営業の受付担当',reading:'えいぎょうのうけつけたんとう'},
    ]},
    {id:'general',name:'総務',reading:'そうむ',people:[
      {id:'sample-general',name:'総務担当者',reading:'そうむたんとうしゃ'},
    ]},
  ],
};
export const departmentById=id=>DIRECTORY.departments.find(d=>d.id===id);
export const PAGE_SIZE=4;
export const directoryPage=(items,page=0)=>items.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
