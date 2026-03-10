export const PORT = parseInt(process.env.PORT || '60000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'dev';
export const IS_PROD = NODE_ENV === 'prod' || NODE_ENV === 'production';
